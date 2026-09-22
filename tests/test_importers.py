"""Tests de la importacion de destinatarios desde archivos."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from crearborradores.importers import FileImportError, import_addresses  # noqa: E402

try:
    import openpyxl
except ModuleNotFoundError:  # pragma: no cover
    openpyxl = None


class TestImportadores(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, name, content, encoding="utf-8"):
        path = self.dir / name
        path.write_text(content, encoding=encoding)
        return path

    def test_txt(self):
        path = self._write("lista.txt", "ana@x.com\nluis@y.com\n")
        self.assertEqual(import_addresses(path), ["ana@x.com", "luis@y.com"])

    def test_csv_con_encabezado_y_columnas(self):
        path = self._write("lista.csv", "Nombre;Correo;Area\nAna;ana@x.com;Ventas\nLuis;luis@y.com;RRHH\n")
        self.assertEqual(import_addresses(path), ["ana@x.com", "luis@y.com"])

    def test_csv_separado_por_comas(self):
        path = self._write("lista.csv", "nombre,correo\nAna,ana@x.com\n")
        self.assertEqual(import_addresses(path), ["ana@x.com"])

    def test_archivo_en_cp1252(self):
        path = self._write("lista.txt", "Ana Pérez ana@x.com\n", encoding="cp1252")
        self.assertEqual(import_addresses(path), ["ana@x.com"])

    def test_duplicados_se_eliminan(self):
        path = self._write("lista.txt", "ana@x.com\nANA@X.COM\nluis@y.com\n")
        self.assertEqual(import_addresses(path), ["ana@x.com", "luis@y.com"])

    def test_archivo_sin_direcciones(self):
        path = self._write("lista.txt", "no hay nada\n")
        with self.assertRaises(FileImportError):
            import_addresses(path)

    def test_archivo_inexistente(self):
        with self.assertRaises(FileImportError):
            import_addresses(self.dir / "no-existe.csv")

    def test_xls_viejo_avisa(self):
        path = self._write("lista.xls", "loquesea")
        with self.assertRaises(FileImportError) as ctx:
            import_addresses(path)
        self.assertIn(".xlsx", str(ctx.exception))

    @unittest.skipIf(openpyxl is None, "openpyxl no instalado")
    def test_xlsx_varias_hojas(self):
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.append(["Nombre", "Correo"])
        sheet.append(["Ana", "ana@x.com"])
        sheet.append([None, None])
        sheet.append(["Luis", "luis@y.com"])
        segunda = workbook.create_sheet("Otros")
        segunda.append(["eva@z.com"])
        path = self.dir / "lista.xlsx"
        workbook.save(path)
        self.assertEqual(import_addresses(path), ["ana@x.com", "luis@y.com", "eva@z.com"])

    @unittest.skipIf(openpyxl is None, "openpyxl no instalado")
    def test_xlsx_roto_avisa(self):
        path = self._write("roto.xlsx", "esto no es un excel")
        with self.assertRaises(FileImportError):
            import_addresses(path)


if __name__ == "__main__":
    unittest.main()
