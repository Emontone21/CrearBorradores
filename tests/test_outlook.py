"""Tests del puente con Outlook (sin depender de Windows)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from crearborradores.drafts import DraftSpec  # noqa: E402
from crearborradores.outlook import (  # noqa: E402
    DryRunBackend,
    OutlookBackend,
    OutlookError,
    create_backend,
    is_windows,
)


class TestBackend(unittest.TestCase):
    def test_backend_de_prueba_registra_lo_pedido(self):
        backend = DryRunBackend()
        spec = DraftSpec(to=["ana@x.com"], subject="Hola", body="Cuerpo")
        with backend:
            backend.create_draft(spec)
        self.assertEqual(backend.created, [spec])

    def test_dry_run_forzado(self):
        self.assertIsInstance(create_backend(dry_run=True), DryRunBackend)

    @unittest.skipIf(is_windows(), "en Windows se intenta conectar de verdad")
    def test_fuera_de_windows_usa_el_backend_de_prueba(self):
        self.assertIsInstance(create_backend(), DryRunBackend)

    @unittest.skipIf(is_windows(), "en Windows se intenta conectar de verdad")
    def test_backend_real_avisa_fuera_de_windows(self):
        with self.assertRaises(OutlookError):
            OutlookBackend()

    def test_com_initialize_devuelve_algo_llamable(self):
        from crearborradores.outlook import com_initialize

        release = com_initialize()
        self.assertTrue(callable(release))
        release()


if __name__ == "__main__":
    unittest.main()
