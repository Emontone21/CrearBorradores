"""Tests del parseo de direcciones."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from crearborradores.emails import (  # noqa: E402
    Recipient,
    extract_addresses,
    is_valid_address,
    parse_recipients,
)


class TestValidacion(unittest.TestCase):
    def test_direcciones_validas(self):
        for address in [
            "ana@ejemplo.com",
            "ana.perez@ejemplo.com.ar",
            "ana+pedidos@sub.ejemplo.com",
            "a@b.co",
            "nombre_apellido@empresa-sa.com",
        ]:
            self.assertTrue(is_valid_address(address), address)

    def test_direcciones_invalidas(self):
        for address in [
            "",
            "ana",
            "ana@",
            "@ejemplo.com",
            "ana@ejemplo",
            "ana..perez@ejemplo.com",
            ".ana@ejemplo.com",
            "ana.@ejemplo.com",
            "ana@ejemplo..com",
            "ana perez@ejemplo.com",
        ]:
            self.assertFalse(is_valid_address(address), address)

    def test_local_muy_largo(self):
        self.assertFalse(is_valid_address("a" * 65 + "@ejemplo.com"))


class TestParseo(unittest.TestCase):
    def test_una_por_linea(self):
        result = parse_recipients("ana@x.com\nluis@y.com\n")
        self.assertEqual(result.addresses, ["ana@x.com", "luis@y.com"])
        self.assertEqual(result.invalid, [])

    def test_separadores_mezclados(self):
        result = parse_recipients("ana@x.com; luis@y.com, eva@z.com\nsol@w.com")
        self.assertEqual(
            result.addresses, ["ana@x.com", "luis@y.com", "eva@z.com", "sol@w.com"]
        )

    def test_varias_separadas_por_espacio(self):
        result = parse_recipients("ana@x.com luis@y.com")
        self.assertEqual(result.addresses, ["ana@x.com", "luis@y.com"])

    def test_nombre_entre_angulos(self):
        result = parse_recipients("Ana Perez <ana@x.com>")
        self.assertEqual(result.recipients[0], Recipient("ana@x.com", "Ana Perez"))

    def test_nombre_con_coma_en_una_sola_linea(self):
        result = parse_recipients('"Perez, Ana" <ana@x.com>')
        self.assertEqual(result.recipients[0].address, "ana@x.com")
        self.assertEqual(result.recipients[0].display_name, "Perez, Ana")

    def test_nombre_sin_angulos(self):
        result = parse_recipients("Ana Perez ana@x.com")
        self.assertEqual(result.recipients[0].display_name, "Ana Perez")

    def test_mailto(self):
        result = parse_recipients("mailto:ana@x.com")
        self.assertEqual(result.addresses, ["ana@x.com"])

    def test_duplicados_sin_distinguir_mayusculas(self):
        result = parse_recipients("ana@x.com\nANA@X.COM\nluis@y.com")
        self.assertEqual(result.addresses, ["ana@x.com", "luis@y.com"])
        self.assertEqual(result.duplicates, ["ANA@X.COM"])

    def test_invalidas_se_reportan(self):
        result = parse_recipients("ana@x.com\nesto no es un mail\n")
        self.assertEqual(result.addresses, ["ana@x.com"])
        self.assertEqual(result.invalid, ["esto no es un mail"])

    def test_texto_vacio(self):
        result = parse_recipients("   \n  \n")
        self.assertEqual(result.addresses, [])
        self.assertFalse(result)

    def test_formato_para_outlook(self):
        self.assertEqual(Recipient("ana@x.com").format(), "ana@x.com")
        self.assertEqual(
            Recipient("ana@x.com", "Ana Perez").format(), '"Ana Perez" <ana@x.com>'
        )

    def test_comillas_en_el_nombre_no_rompen_el_formato(self):
        formatted = Recipient("ana@x.com", 'Ana "La Jefa"').format()
        self.assertEqual(formatted.count('"'), 2)


class TestExtraccion(unittest.TestCase):
    def test_extrae_de_texto_libre(self):
        texto = "Contactar a ana@x.com o a luis@y.com (copia: ana@x.com)."
        self.assertEqual(extract_addresses(texto), ["ana@x.com", "luis@y.com"])

    def test_sin_direcciones(self):
        self.assertEqual(extract_addresses("nada por aca"), [])


if __name__ == "__main__":
    unittest.main()
