"""Tests de las variables del asunto y el cuerpo."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from crearborradores.variables import (  # noqa: E402
    Kind,
    Variable,
    count_problems,
    find_used,
    is_valid_name,
    missing_values,
    normalize_name,
    render,
    split_values,
    undefined_names,
    unused_names,
    values_for_index,
)


class TestNombres(unittest.TestCase):
    def test_normalizacion(self):
        self.assertEqual(normalize_name(" subordinado "), "SUBORDINADO")
        self.assertEqual(normalize_name("[Subordinado]"), "SUBORDINADO")
        self.assertEqual(normalize_name("nombre   completo"), "NOMBRE COMPLETO")

    def test_nombres_validos(self):
        for name in ["SUBORDINADO", "Mes", "var_1", "nombre completo", "área"]:
            self.assertTrue(is_valid_name(name), name)

    def test_nombres_invalidos(self):
        for name in ["", "   ", "a[b", "a]b", "a" * 61]:
            self.assertFalse(is_valid_name(name), repr(name))

    def test_un_salto_de_linea_se_convierte_en_espacio(self):
        # El nombre siempre termina en una sola línea, como lo exige [ ].
        self.assertEqual(normalize_name("hola\nchau"), "HOLA CHAU")
        self.assertTrue(is_valid_name("hola\nchau"))


class TestBusqueda(unittest.TestCase):
    def test_encuentra_en_orden_y_sin_repetir(self):
        texto = "Hola [NOMBRE], por [CASO] y otra vez [nombre]"
        self.assertEqual(find_used(texto), ["NOMBRE", "CASO"])

    def test_busca_en_varios_textos(self):
        self.assertEqual(find_used("[A]", "[B] y [A]"), ["A", "B"])

    def test_sin_variables(self):
        self.assertEqual(find_used("texto sin nada"), [])


class TestReemplazo(unittest.TestCase):
    def test_reemplaza_sin_distinguir_mayusculas(self):
        self.assertEqual(render("Hola [nombre]", {"NOMBRE": "Ana"}), "Hola Ana")

    def test_deja_lo_que_no_esta_definido(self):
        self.assertEqual(render("Hola [OTRA]", {"NOMBRE": "Ana"}), "Hola [OTRA]")

    def test_varias_apariciones(self):
        self.assertEqual(render("[A] y [A]", {"A": "x"}), "x y x")

    def test_un_valor_con_corchetes_no_se_vuelve_a_interpretar(self):
        salida = render("Hola [A]", {"A": "[B]", "B": "no"})
        self.assertEqual(salida, "Hola [B]")

    def test_texto_vacio(self):
        self.assertEqual(render("", {"A": "x"}), "")


class TestValores(unittest.TestCase):
    def test_quita_las_lineas_en_blanco_del_final(self):
        self.assertEqual(split_values("Ana\nLuis\n\n\n"), ["Ana", "Luis"])

    def test_conserva_una_linea_vacia_del_medio(self):
        self.assertEqual(split_values("Ana\n\nLuis"), ["Ana", "", "Luis"])

    def test_texto_vacio(self):
        self.assertEqual(split_values(""), [])

    def test_valores_por_indice(self):
        variables = [
            Variable("CASO", Kind.ROW, values=["uno", "dos"]),
            Variable("MES", Kind.FIXED, value="septiembre"),
        ]
        self.assertEqual(values_for_index(variables, 0), {"CASO": "uno", "MES": "septiembre"})
        self.assertEqual(values_for_index(variables, 1), {"CASO": "dos", "MES": "septiembre"})

    def test_indice_fuera_de_rango_da_vacio(self):
        variables = [Variable("CASO", Kind.ROW, values=["uno"])]
        self.assertEqual(values_for_index(variables, 5), {"CASO": ""})


class TestControles(unittest.TestCase):
    def test_avisa_cuando_falta_o_sobra_algun_valor(self):
        variables = [Variable("CASO", Kind.ROW, values=["uno", "dos"])]
        self.assertEqual(count_problems(variables, 2), [])
        problemas = count_problems(variables, 3)
        self.assertEqual(len(problemas), 1)
        self.assertIn("[CASO]", problemas[0])

    def test_las_fijas_nunca_dan_problema_de_cantidad(self):
        variables = [Variable("MES", Kind.FIXED, value="x")]
        self.assertEqual(count_problems(variables, 50), [])

    def test_detecta_valores_vacios(self):
        variables = [
            Variable("CASO", Kind.ROW, values=["uno", "", "tres"]),
            Variable("OK", Kind.ROW, values=["a", "b", "c"]),
            Variable("MES", Kind.FIXED, value="  "),
        ]
        self.assertEqual(missing_values(variables, 3), ["CASO", "MES"])

    def test_un_vacio_fuera_del_rango_no_cuenta(self):
        variables = [Variable("CASO", Kind.ROW, values=["uno", ""])]
        self.assertEqual(missing_values(variables, 1), [])

    def test_usadas_pero_no_definidas(self):
        variables = [Variable("CASO", Kind.ROW)]
        self.assertEqual(undefined_names(variables, "[CASO] y [OTRA]"), ["OTRA"])

    def test_definidas_pero_no_usadas(self):
        variables = [Variable("CASO", Kind.ROW), Variable("SOBRA", Kind.ROW)]
        self.assertEqual(unused_names(variables, "solo [CASO]"), ["SOBRA"])


if __name__ == "__main__":
    unittest.main()
