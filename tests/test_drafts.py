"""Tests de la construccion de borradores."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from crearborradores.drafts import (  # noqa: E402
    Mode,
    build_merge_rows,
    build_merge_specs,
    build_specs,
    merge_with_signature,
    text_to_html,
)
from crearborradores.emails import Recipient, parse_rows  # noqa: E402
from crearborradores.variables import Kind, Variable  # noqa: E402

RECIPIENTS = [Recipient("ana@x.com", "Ana"), Recipient("luis@y.com"), Recipient("eva@z.com")]


class TestBuildSpecs(unittest.TestCase):
    def test_modo_unicos_crea_uno_por_destinatario(self):
        specs = build_specs(RECIPIENTS, "Asunto", "Cuerpo", Mode.INDIVIDUAL)
        self.assertEqual(len(specs), 3)
        self.assertEqual([s.to for s in specs], [['"Ana" <ana@x.com>'], ["luis@y.com"], ["eva@z.com"]])

    def test_modo_grupo_crea_uno_solo(self):
        specs = build_specs(RECIPIENTS, "Asunto", "Cuerpo", Mode.GROUP)
        self.assertEqual(len(specs), 1)
        self.assertEqual(len(specs[0].to), 3)

    def test_cc_y_cco_se_repiten_en_cada_borrador_individual(self):
        specs = build_specs(
            RECIPIENTS,
            "Asunto",
            "Cuerpo",
            Mode.INDIVIDUAL,
            cc=[Recipient("jefe@x.com")],
            bcc=[Recipient("archivo@x.com")],
        )
        self.assertTrue(all(s.cc == ["jefe@x.com"] for s in specs))
        self.assertTrue(all(s.bcc == ["archivo@x.com"] for s in specs))

    def test_las_listas_no_se_comparten_entre_borradores(self):
        specs = build_specs(RECIPIENTS, "A", "B", Mode.INDIVIDUAL, cc=[Recipient("j@x.com")])
        specs[0].cc.append("otro@x.com")
        self.assertEqual(specs[1].cc, ["j@x.com"])

    def test_sin_destinatarios_no_crea_nada(self):
        self.assertEqual(build_specs([], "A", "B", Mode.GROUP), [])

    def test_adjuntos_en_todos(self):
        specs = build_specs(RECIPIENTS, "A", "B", Mode.INDIVIDUAL, attachments=["/tmp/a.pdf"])
        self.assertTrue(all(s.attachments == ["/tmp/a.pdf"] for s in specs))

    def test_label(self):
        specs = build_specs(RECIPIENTS, "A", "B", Mode.GROUP)
        self.assertIn("+2", specs[0].label)


class TestVariables(unittest.TestCase):
    """Lo importante acá es que cada fila reciba SUS valores y no los de otra."""

    def _variables(self):
        return [
            Variable("SUBORDINADO", Kind.ROW, values=["Juan", "Marta", "Luis"]),
            Variable("MES", Kind.FIXED, value="septiembre"),
        ]

    def test_un_borrador_por_fila_con_su_valor(self):
        rows = parse_rows("sup1@x.com\nsup2@x.com\nsup3@x.com")
        specs = build_merge_specs(
            build_merge_rows(rows, self._variables()),
            "Caso de [SUBORDINADO]",
            "Te escribo por [SUBORDINADO] en [MES].",
        )
        self.assertEqual([s.subject for s in specs],
                         ["Caso de Juan", "Caso de Marta", "Caso de Luis"])
        self.assertTrue(all("septiembre" in s.body for s in specs))

    def test_el_mismo_supervisor_recibe_un_borrador_por_fila(self):
        rows = parse_rows("sup@x.com\nsup@x.com")
        variables = [Variable("CASO", Kind.ROW, values=["uno", "dos"])]
        specs = build_merge_specs(build_merge_rows(rows, variables), "[CASO]", "")
        self.assertEqual(len(specs), 2)
        self.assertEqual([s.to for s in specs], [["sup@x.com"], ["sup@x.com"]])
        self.assertEqual([s.subject for s in specs], ["uno", "dos"])

    def test_una_fila_invalida_se_saltea_sin_correr_las_demas(self):
        # Si se corriera una fila, un supervisor recibiría datos de otro.
        rows = parse_rows("sup1@x.com\nbasura\nsup3@x.com")
        specs = build_merge_specs(
            build_merge_rows(rows, self._variables()), "[SUBORDINADO]", ""
        )
        self.assertEqual([s.to for s in specs], [["sup1@x.com"], ["sup3@x.com"]])
        self.assertEqual([s.subject for s in specs], ["Juan", "Luis"])

    def test_una_linea_vacia_tampoco_corre_las_filas(self):
        rows = parse_rows("sup1@x.com\n\nsup3@x.com")
        specs = build_merge_specs(
            build_merge_rows(rows, self._variables()), "[SUBORDINADO]", ""
        )
        self.assertEqual([s.subject for s in specs], ["Juan", "Luis"])

    def test_si_faltan_valores_queda_vacio_y_no_se_corre(self):
        rows = parse_rows("a@x.com\nb@x.com\nc@x.com")
        variables = [Variable("CASO", Kind.ROW, values=["uno"])]
        specs = build_merge_specs(build_merge_rows(rows, variables), "[CASO]", "")
        self.assertEqual([s.subject for s in specs], ["uno", "", ""])

    def test_lo_que_no_esta_definido_queda_a_la_vista(self):
        rows = parse_rows("a@x.com")
        specs = build_merge_specs(build_merge_rows(rows, []), "[NADA]", "")
        self.assertEqual(specs[0].subject, "[NADA]")

    def test_cc_y_adjuntos_no_se_comparten_entre_borradores(self):
        rows = parse_rows("a@x.com\nb@x.com")
        specs = build_merge_specs(
            build_merge_rows(rows, []), "s", "b",
            cc=[Recipient("jefe@x.com")], attachments=["/tmp/a.pdf"],
        )
        specs[0].cc.append("otro@x.com")
        specs[0].attachments.append("/tmp/b.pdf")
        self.assertEqual(specs[1].cc, ["jefe@x.com"])
        self.assertEqual(specs[1].attachments, ["/tmp/a.pdf"])

    def test_las_fijas_tambien_valen_sin_variables_por_fila(self):
        specs = build_specs(
            RECIPIENTS, "Informe de [MES]", "Hola", Mode.GROUP,
            values={"MES": "septiembre"},
        )
        self.assertEqual(specs[0].subject, "Informe de septiembre")


class TestCuerpoHtml(unittest.TestCase):
    def test_escapa_html(self):
        html = text_to_html("5 < 10 & <b>hola</b>")
        self.assertNotIn("<b>", html)
        self.assertIn("&lt;b&gt;", html)

    def test_saltos_de_linea(self):
        self.assertIn("<br>", text_to_html("uno\ndos"))

    def test_saltos_windows(self):
        self.assertEqual(text_to_html("uno\r\ndos").count("<br>"), 1)


class TestFirma(unittest.TestCase):
    def test_sin_firma_devuelve_el_cuerpo(self):
        self.assertEqual(merge_with_signature("<div>hola</div>", ""), "<div>hola</div>")

    def test_cuerpo_va_arriba_de_la_firma_dentro_del_body(self):
        firma = '<html><head></head><body lang="ES">FIRMA</body></html>'
        merged = merge_with_signature("<div>CUERPO</div>", firma)
        self.assertEqual(merged, '<html><head></head><body lang="ES"><div>CUERPO</div>FIRMA</body></html>')
        self.assertLess(merged.index("CUERPO"), merged.index("FIRMA"))

    def test_firma_sin_tag_body(self):
        merged = merge_with_signature("<div>CUERPO</div>", "<p>FIRMA</p>")
        self.assertEqual(merged, "<div>CUERPO</div><p>FIRMA</p>")


if __name__ == "__main__":
    unittest.main()
