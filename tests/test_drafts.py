"""Tests de la construccion de borradores."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from crearborradores.drafts import (  # noqa: E402
    Mode,
    build_specs,
    merge_with_signature,
    text_to_html,
)
from crearborradores.emails import Recipient  # noqa: E402

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
