"""Parseo, validación y normalización de direcciones de correo.

Modulo puro (sin dependencias de Windows ni de la interfaz) para poder
testearlo en cualquier sistema operativo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Patron usado para *localizar* direcciones dentro de texto libre (pegado de
# Excel, de un mail reenviado, etc.). Es deliberadamente algo permisivo.
_EMAIL_PATTERN = (
    r"[A-Za-z0-9._%+'&-]+"
    r"@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+"
)

EMAIL_RE = re.compile(_EMAIL_PATTERN)
_EMAIL_FULL_RE = re.compile(rf"^{_EMAIL_PATTERN}$")
_ANGLE_RE = re.compile(r"<([^<>]*)>")
_MAILTO_RE = re.compile(r"^mailto:", re.IGNORECASE)


@dataclass(frozen=True)
class Recipient:
    """Un destinatario: dirección obligatoria y nombre para mostrar opcional."""

    address: str
    display_name: str = ""

    @property
    def key(self) -> str:
        """Clave de comparación (las direcciones no distinguen mayusculas)."""
        return self.address.lower()

    def format(self) -> str:
        """Formato que entiende Outlook: 'Nombre <dirección>' o solo la dirección."""
        if self.display_name:
            name = self.display_name.replace('"', "'")
            return f'"{name}" <{self.address}>'
        return self.address

    def __str__(self) -> str:  # pragma: no cover - azúcar para mensajes
        return self.format()


@dataclass
class ParseResult:
    """Resultado de interpretar el cuadro de destinatarios."""

    recipients: list[Recipient] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)

    @property
    def addresses(self) -> list[str]:
        return [r.address for r in self.recipients]

    def __bool__(self) -> bool:
        return bool(self.recipients)


def is_valid_address(address: str) -> bool:
    """True si la dirección tiene forma de correo válido."""
    address = address.strip()
    if not address or len(address) > 254:
        return False
    if _EMAIL_FULL_RE.match(address) is None:
        return False
    local, _, domain = address.rpartition("@")
    if not local or len(local) > 64:
        return False
    # Un punto al principio/final del usuario, o dos puntos seguidos, no es válido.
    if local.startswith(".") or local.endswith(".") or ".." in local:
        return False
    if ".." in domain:
        return False
    return True


def _split_line(line: str) -> list[str]:
    """Separa una línea en entradas individuales.

    Si la línea tiene una sola dirección se devuelve entera, para no romper
    nombres con coma del estilo ``Perez, Juan <juan@ejemplo.com>``.
    """
    found = EMAIL_RE.findall(line)
    if len(found) <= 1:
        return [line]

    chunks = [c for c in re.split(r"[;,]", line) if c.strip()]
    result: list[str] = []
    for chunk in chunks:
        if len(EMAIL_RE.findall(chunk)) > 1:
            # Varias direcciones separadas solo por espacios.
            result.extend(p for p in re.split(r"\s+", chunk.strip()) if p)
        else:
            result.append(chunk)
    return result


def _parse_entry(raw: str) -> Recipient | None:
    """Convierte una entrada suelta en Recipient, o None si no es válida."""
    entry = raw.strip().strip(",;").strip()
    if not entry:
        return None

    display_name = ""
    angle = _ANGLE_RE.search(entry)
    if angle:
        address = angle.group(1).strip()
        display_name = entry[: angle.start()].strip()
    else:
        found = EMAIL_RE.findall(entry)
        if len(found) != 1:
            return None
        address = found[0]
        # Todo lo que sobra alrededor de la dirección se usa como nombre.
        display_name = entry.replace(address, " ").strip()

    address = _MAILTO_RE.sub("", address).strip().strip("<>").strip()
    display_name = display_name.strip().strip(",;:").strip().strip('"').strip()

    if not is_valid_address(address):
        return None
    return Recipient(address=address, display_name=display_name)


def parse_recipients(text: str) -> ParseResult:
    """Interpreta el texto del cuadro PARA / CC / CCO.

    Acepta una dirección por línea y tambien listas separadas por coma o
    punto y coma, con o sin nombre para mostrar. Quita duplicados
    conservando el orden de aparición.
    """
    result = ParseResult()
    if not text or not text.strip():
        return result

    seen: dict[str, Recipient] = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        for chunk in _split_line(line):
            if not chunk.strip():
                continue
            recipient = _parse_entry(chunk)
            if recipient is None:
                result.invalid.append(chunk.strip())
                continue
            if recipient.key in seen:
                result.duplicates.append(recipient.address)
                continue
            seen[recipient.key] = recipient
            result.recipients.append(recipient)

    return result


@dataclass
class Row:
    """Una línea del cuadro PARA.

    En modo uno a uno cada línea es un borrador, y su posición es la que
    empareja con los valores de las variables. Por eso acá no se quitan
    repetidos ni se reordena nada: correr una fila sería mandarle a un
    supervisor los datos de otro.
    """

    number: int
    text: str
    recipients: list[Recipient] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)

    @property
    def is_blank(self) -> bool:
        return not self.text.strip()

    @property
    def is_usable(self) -> bool:
        return bool(self.recipients)


def parse_rows(text: str) -> list[Row]:
    """Interpreta el cuadro PARA línea por línea, conservando el orden.

    Solo se descartan las líneas en blanco del final. Una línea vacía en el
    medio se conserva como fila sin destinatario, para que se vea el
    problema en lugar de correr todo silenciosamente.
    """
    if not text:
        return []

    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    while lines and not lines[-1].strip():
        lines.pop()

    rows: list[Row] = []
    for number, line in enumerate(lines, start=1):
        row = Row(number=number, text=line)
        if line.strip():
            for chunk in _split_line(line):
                if not chunk.strip():
                    continue
                recipient = _parse_entry(chunk)
                if recipient is None:
                    row.invalid.append(chunk.strip())
                else:
                    row.recipients.append(recipient)
        rows.append(row)
    return rows


def extract_addresses(text: str) -> list[str]:
    """Saca todas las direcciones que aparezcan en un texto, sin duplicados."""
    seen: set[str] = set()
    addresses: list[str] = []
    for match in EMAIL_RE.findall(text or ""):
        candidate = match.strip().strip(".")
        if not is_valid_address(candidate):
            continue
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        addresses.append(candidate)
    return addresses
