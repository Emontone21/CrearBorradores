"""Puente con Outlook de escritorio via COM (pywin32).

La app NUNCA envía correos: solo crea el item y lo guarda, con lo cual
queda en la carpeta Borradores esperando que la persona lo revise.
Tampoco pide usuario ni contrasena: usa la sesión de Outlook ya abierta.
"""

from __future__ import annotations

import os
import sys
import threading
from dataclasses import dataclass

from .drafts import DraftSpec, merge_with_signature, text_to_html

# Constantes de la API de Outlook (no hace falta importar la typelib).
OL_MAIL_ITEM = 0
OL_FOLDER_DRAFTS = 16


class OutlookError(RuntimeError):
    """Error con un mensaje listo para mostrarle al usuario."""


@dataclass
class DraftResult:
    """Resultado de intentar crear un borrador."""

    spec: DraftSpec
    ok: bool
    error: str = ""


def is_windows() -> bool:
    return sys.platform.startswith("win")


def _friendly_com_error(exc: Exception) -> str:
    detail = str(exc)
    lowered = detail.lower()
    if "invalid class string" in lowered or "registrada" in lowered:
        return (
            "No se encontró Outlook de escritorio en esta computadora.\n\n"
            "La app necesita el Outlook clásico instalado (el que viene con "
            "Microsoft 365 / Office). El 'nuevo Outlook' y la versión web no "
            "sirven porque no permiten automatización."
        )
    if "0x80080005" in detail or "server execution failed" in lowered:
        return (
            "Windows no pudo iniciar Outlook.\n\n"
            "Suele pasar cuando Outlook y esta app corren con permisos "
            "distintos. Abrí Outlook normalmente (sin 'Ejecutar como "
            "administrador') y volvé a intentar."
        )
    if "call was rejected" in lowered or "0x80010001" in detail:
        return (
            "Outlook está ocupado y rechazó el pedido.\n\n"
            "Cerrá los cuadros de diálogo que tenga abiertos (por ejemplo una "
            "ventana de mensaje nuevo) y volvé a intentar."
        )
    return f"Outlook devolvió un error:\n\n{detail}"


class BaseBackend:
    """Interfaz comun para el backend real y el de prueba."""

    def create_draft(self, spec: DraftSpec, include_signature: bool = False) -> None:
        raise NotImplementedError

    def close(self) -> None:
        pass

    def __enter__(self) -> "BaseBackend":
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()


class OutlookBackend(BaseBackend):
    """Backend real: crea los borradores en el Outlook instalado.

    Hay que usarlo dentro del mismo hilo en el que se construyo, porque COM
    trabaja por apartamentos.
    """

    def __init__(self) -> None:
        if not is_windows():
            raise OutlookError(
                "Esta función solo está disponible en Windows con Outlook de "
                "escritorio instalado."
            )
        try:
            import pythoncom  # noqa: F401  (import tardío: solo existe en Windows)
            import win32com.client
        except ModuleNotFoundError as exc:  # pragma: no cover - solo sin pywin32
            raise OutlookError(
                "Falta la librería 'pywin32', que es la que conversa con "
                "Outlook.\n\nInstalala con:  pip install pywin32"
            ) from exc

        try:
            # Dispatch (enlace tardío) a propósito: gencache/EnsureDispatch
            # escribe cache en disco y falla dentro del .exe empaquetado.
            self._outlook = win32com.client.Dispatch("Outlook.Application")
        except Exception as exc:
            raise OutlookError(_friendly_com_error(exc)) from exc

    def create_draft(self, spec: DraftSpec, include_signature: bool = False) -> None:
        try:
            mail = self._outlook.CreateItem(OL_MAIL_ITEM)
            mail.To = "; ".join(spec.to)
            mail.CC = "; ".join(spec.cc)
            mail.BCC = "; ".join(spec.bcc)
            mail.Subject = spec.subject

            if include_signature:
                signature = ""
                try:
                    # Pedir el Inspector hace que Outlook inserte la firma
                    # configurada por el usuario. No abre ninguna ventana.
                    mail.GetInspector
                    signature = mail.HTMLBody or ""
                except Exception:
                    signature = ""
                mail.HTMLBody = merge_with_signature(text_to_html(spec.body), signature)
            else:
                mail.Body = spec.body

            for path in spec.attachments:
                mail.Attachments.Add(os.path.abspath(path))

            # Save() lo deja en Borradores. Nunca se llama a Send().
            mail.Save()
        except OutlookError:
            raise
        except Exception as exc:
            raise OutlookError(_friendly_com_error(exc)) from exc

    def close(self) -> None:
        self._outlook = None


class DryRunBackend(BaseBackend):
    """Backend de prueba: no toca Outlook, solo guarda lo que se le pide.

    Se usa en los tests y para poder abrir la interfaz fuera de Windows.
    """

    def __init__(self) -> None:
        self.created: list[DraftSpec] = []

    def create_draft(self, spec: DraftSpec, include_signature: bool = False) -> None:
        self.created.append(spec)


def create_backend(dry_run: bool = False) -> BaseBackend:
    """Devuelve el backend adecuado para el entorno actual."""
    if dry_run or not is_windows():
        return DryRunBackend()
    return OutlookBackend()


def com_initialize():
    """Inicializa COM en el hilo actual. Devuelve la función para liberarlo."""
    if not is_windows():
        return lambda: None
    try:
        import pythoncom
    except ModuleNotFoundError:  # pragma: no cover
        return lambda: None
    pythoncom.CoInitialize()
    return pythoncom.CoUninitialize


def open_drafts_folder() -> None:
    """Abre la carpeta Borradores de Outlook en primer plano.

    Se ejecuta en un hilo aparte para no bloquear la interfaz y para no
    mezclar apartamentos COM.
    """
    if not is_windows():
        return

    def _run() -> None:
        release = com_initialize()
        try:
            import win32com.client

            outlook = win32com.client.Dispatch("Outlook.Application")
            drafts = outlook.GetNamespace("MAPI").GetDefaultFolder(OL_FOLDER_DRAFTS)
            drafts.Display()
        except Exception:
            # Es una comodidad, no una función crítica: si falla, se ignora.
            pass
        finally:
            release()

    threading.Thread(target=_run, daemon=True).start()
