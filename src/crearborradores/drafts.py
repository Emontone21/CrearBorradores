"""Construccion de los borradores a partir de lo que carga el usuario.

Lógica pura: arma la lista de mensajes y el HTML del cuerpo, sin tocar
Outlook. Eso permite testearlo fuera de Windows.
"""

from __future__ import annotations

import html
from dataclasses import dataclass, field
from enum import Enum

from .emails import Recipient


class Mode(str, Enum):
    """Como se reparten los destinatarios entre los borradores."""

    INDIVIDUAL = "individual"  # un borrador por destinatario
    GROUP = "group"  # un solo borrador con todos en Para


@dataclass
class DraftSpec:
    """Todo lo necesario para crear un borrador en Outlook."""

    to: list[str] = field(default_factory=list)
    cc: list[str] = field(default_factory=list)
    bcc: list[str] = field(default_factory=list)
    subject: str = ""
    body: str = ""
    attachments: list[str] = field(default_factory=list)

    @property
    def label(self) -> str:
        """Texto corto para mostrar en el progreso y en los errores."""
        if not self.to:
            return "(sin destinatario)"
        if len(self.to) == 1:
            return self.to[0]
        return f"{self.to[0]} (+{len(self.to) - 1})"


def build_specs(
    recipients: list[Recipient],
    subject: str,
    body: str,
    mode: Mode,
    cc: list[Recipient] | None = None,
    bcc: list[Recipient] | None = None,
    attachments: list[str] | None = None,
) -> list[DraftSpec]:
    """Arma la lista de borradores a crear.

    - ``Mode.INDIVIDUAL``: un borrador por destinatario (nadie ve a los demás).
      CC y CCO se repiten en cada borrador.
    - ``Mode.GROUP``: un único borrador con todos los destinatarios en Para.
    """
    cc_list = [r.format() for r in (cc or [])]
    bcc_list = [r.format() for r in (bcc or [])]
    files = list(attachments or [])

    if not recipients:
        return []

    if mode is Mode.GROUP:
        return [
            DraftSpec(
                to=[r.format() for r in recipients],
                cc=cc_list,
                bcc=bcc_list,
                subject=subject,
                body=body,
                attachments=files,
            )
        ]

    return [
        DraftSpec(
            to=[r.format()],
            cc=list(cc_list),
            bcc=list(bcc_list),
            subject=subject,
            body=body,
            attachments=list(files),
        )
        for r in recipients
    ]


def text_to_html(text: str) -> str:
    """Convierte el cuerpo en texto plano a HTML seguro para Outlook."""
    escaped = html.escape(text or "", quote=False)
    lines = escaped.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    # Los espacios seguidos se preservan para no romper indentaciones simples.
    lines = [line.replace("  ", "&nbsp;&nbsp;") for line in lines]
    return (
        '<div style="font-family:Calibri,sans-serif;font-size:11pt;">'
        + "<br>".join(lines)
        + "</div>"
    )


def merge_with_signature(body_html: str, signature_html: str) -> str:
    """Inserta el cuerpo arriba de la firma que Outlook ya puso en el borrador.

    La firma viene como documento HTML completo, asi que el cuerpo se mete
    justo despues de ``<body...>`` en vez de pegarlo antes de ``<html>``.
    """
    if not signature_html or not signature_html.strip():
        return body_html

    lowered = signature_html.lower()
    start = lowered.find("<body")
    if start != -1:
        end = signature_html.find(">", start)
        if end != -1:
            return (
                signature_html[: end + 1]
                + body_html
                + signature_html[end + 1 :]
            )
    return body_html + signature_html
