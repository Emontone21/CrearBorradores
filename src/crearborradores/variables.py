"""Variables que se reemplazan en el asunto y el cuerpo.

En el texto se escriben entre corchetes, por ejemplo [SUBORDINADO]. Hay
dos clases: las que cambian en cada borrador (una lista de valores, uno
por fila) y las fijas, que valen lo mismo para todos.

Módulo puro, sin dependencias de la interfaz ni de Windows.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

# El nombre va entre corchetes, en una sola línea y sin corchetes adentro.
VARIABLE_PATTERN = re.compile(r"\[([^\[\]\r\n]{1,60})\]")
_NAME_RE = re.compile(r"^[\w ._-]{1,60}$", re.UNICODE)


class Kind(str, Enum):
    """Cómo se completa una variable."""

    ROW = "row"      # un valor distinto por cada borrador
    FIXED = "fixed"  # el mismo valor en todos


@dataclass
class Variable:
    """Una variable definida por el usuario."""

    name: str
    kind: Kind = Kind.ROW
    values: list[str] = field(default_factory=list)  # solo para ROW
    value: str = ""                                  # solo para FIXED

    @property
    def token(self) -> str:
        return f"[{self.name}]"

    @property
    def is_row(self) -> bool:
        return self.kind is Kind.ROW


def normalize_name(name: str) -> str:
    """Deja el nombre como se guarda: sin corchetes, sin espacios de más y en mayúsculas."""
    clean = (name or "").strip()
    if clean.startswith("[") and clean.endswith("]"):
        clean = clean[1:-1].strip()
    return " ".join(clean.split()).upper()


def is_valid_name(name: str) -> bool:
    """True si el nombre sirve como variable."""
    clean = normalize_name(name)
    return bool(clean) and _NAME_RE.match(clean) is not None


def find_used(*templates: str) -> list[str]:
    """Nombres de variables que aparecen en los textos, en orden y sin repetir."""
    seen: set[str] = set()
    found: list[str] = []
    for template in templates:
        for match in VARIABLE_PATTERN.finditer(template or ""):
            name = normalize_name(match.group(1))
            if not name or name in seen:
                continue
            seen.add(name)
            found.append(name)
    return found


def render(template: str, values: dict[str, str]) -> str:
    """Reemplaza las variables del texto por sus valores.

    Lo que no esté definido se deja tal cual, para que se note en la vista
    previa en vez de desaparecer sin aviso. El reemplazo es de una sola
    pasada: si un valor contiene corchetes, no se vuelve a interpretar.
    """

    def replace(match: re.Match) -> str:
        name = normalize_name(match.group(1))
        if name in values:
            return values[name]
        return match.group(0)

    return VARIABLE_PATTERN.sub(replace, template or "")


def split_values(text: str) -> list[str]:
    """Convierte el cuadro de valores en una lista, un valor por línea.

    Solo se descartan las líneas en blanco del final (las que deja cualquier
    copiar y pegar). Una línea vacía en el medio se respeta como valor
    vacío, así nunca se corren las filas sin que se note.
    """
    if not text:
        return []
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    while lines and not lines[-1].strip():
        lines.pop()
    return [line.strip() for line in lines]


def values_for_index(variables: list[Variable], index: int) -> dict[str, str]:
    """Valores que le tocan a la fila número `index` (base 0)."""
    values: dict[str, str] = {}
    for variable in variables:
        if variable.kind is Kind.FIXED:
            values[variable.name] = variable.value
        elif index < len(variable.values):
            values[variable.name] = variable.values[index]
        else:
            values[variable.name] = ""
    return values


def count_problems(variables: list[Variable], expected_rows: int) -> list[str]:
    """Mensajes para las variables por fila que no tienen la cantidad justa."""
    problems: list[str] = []
    for variable in variables:
        if variable.kind is not Kind.ROW:
            continue
        total = len(variable.values)
        if total != expected_rows:
            problems.append(
                f"[{variable.name}] tiene {total} "
                f"valor{'' if total == 1 else 'es'} y hay {expected_rows} "
                f"destinatario{'' if expected_rows == 1 else 's'}."
            )
    return problems


def missing_values(variables: list[Variable], expected_rows: int) -> list[str]:
    """Nombres de variables con algún valor vacío dentro del rango de filas."""
    incomplete: list[str] = []
    for variable in variables:
        if variable.kind is Kind.FIXED:
            if not variable.value.strip():
                incomplete.append(variable.name)
            continue
        usable = variable.values[:expected_rows]
        if any(not value.strip() for value in usable):
            incomplete.append(variable.name)
    return incomplete


def undefined_names(variables: list[Variable], *templates: str) -> list[str]:
    """Variables usadas en los textos que no están definidas."""
    defined = {variable.name for variable in variables}
    return [name for name in find_used(*templates) if name not in defined]


def unused_names(variables: list[Variable], *templates: str) -> list[str]:
    """Variables definidas que no aparecen en ningún texto."""
    used = set(find_used(*templates))
    return [variable.name for variable in variables if variable.name not in used]
