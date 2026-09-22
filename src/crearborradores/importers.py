"""Importacion de destinatarios desde archivos Excel, CSV o TXT."""

from __future__ import annotations

import csv
import io
import os
from pathlib import Path

from .emails import extract_addresses

TEXT_EXTENSIONS = {".txt", ".csv", ".tsv", ".log"}
EXCEL_EXTENSIONS = {".xlsx", ".xlsm", ".xltx", ".xltm"}
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | EXCEL_EXTENSIONS

# Tipos para el diálogo "Abrir archivo" de la interfaz.
FILE_TYPES = [
    ("Todos los soportados", "*.xlsx *.xlsm *.csv *.tsv *.txt"),
    ("Excel", "*.xlsx *.xlsm *.xltx *.xltm"),
    ("CSV / texto", "*.csv *.tsv *.txt"),
    ("Todos los archivos", "*.*"),
]

_ENCODINGS = ("utf-8-sig", "utf-8", "cp1252", "latin-1")


class FileImportError(Exception):
    """Error legible para mostrarle al usuario."""


def _read_text_file(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in _ENCODINGS:
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    # latin-1 nunca falla, pero por las dudas:
    return raw.decode("latin-1", errors="replace")


def _read_csv(path: Path) -> str:
    """Devuelve el contenido del CSV/TSV como texto plano, celda por celda."""
    text = _read_text_file(path)
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    buffer = io.StringIO()
    for row in csv.reader(io.StringIO(text), dialect):
        buffer.write(" ".join(cell for cell in row if cell))
        buffer.write("\n")
    return buffer.getvalue()


def _read_excel(path: Path) -> str:
    try:
        from openpyxl import load_workbook
    except ModuleNotFoundError as exc:  # pragma: no cover - depende del entorno
        raise FileImportError(
            "Para leer archivos de Excel falta la librería 'openpyxl'.\n\n"
            "Instalala con:  pip install openpyxl\n"
            "O guarda la lista como .csv y volvé a intentar."
        ) from exc

    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:
        raise FileImportError(
            f"No se pudo abrir el archivo de Excel.\n\nDetalle: {exc}"
        ) from exc

    buffer = io.StringIO()
    try:
        for sheet in workbook.worksheets:
            for row in sheet.iter_rows(values_only=True):
                for value in row:
                    if value is None:
                        continue
                    buffer.write(str(value))
                    buffer.write("\n")
    finally:
        workbook.close()
    return buffer.getvalue()


def import_addresses(path: str | os.PathLike[str]) -> list[str]:
    """Extrae todas las direcciones de correo de un archivo.

    Recorre todas las hojas/columnas y devuelve las direcciones encontradas
    sin duplicados, en el orden en que aparecen. Como el resultado se vuelca
    en el cuadro de destinatarios, el usuario puede revisarlo y editarlo
    antes de crear nada.
    """
    file_path = Path(path)
    if not file_path.is_file():
        raise FileImportError(f"No se encontró el archivo:\n{file_path}")

    suffix = file_path.suffix.lower()
    if suffix == ".xls":
        raise FileImportError(
            "El formato .xls (Excel 97-2003) no está soportado.\n\n"
            "Abrilo en Excel y guardalo como .xlsx, o exportalo a .csv."
        )

    if suffix in EXCEL_EXTENSIONS:
        content = _read_excel(file_path)
    elif suffix in {".csv", ".tsv"}:
        content = _read_csv(file_path)
    else:
        content = _read_text_file(file_path)

    addresses = extract_addresses(content)
    if not addresses:
        raise FileImportError(
            f"No se encontró ninguna dirección de correo en:\n{file_path.name}"
        )
    return addresses
