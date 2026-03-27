import sys
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import prepare_issue  # noqa: E402


ISSUE_BODY = """### Jira (opcional)
[PW-432](https://suport.ub.edu/browse/PW-432)

### 🌐 Site Context
facultats

### ✨ Descripción de la funcionalidad
Ajustes visuales.

### ❓ Problema o necesidad
Hace falta mejorar el detalle.

### 💡 Propuesta de solución
- Cambiar categorías.

### 📝 Notas adicionales
- Buscador: https://web.ub.edu/web/facultat-economia-empresa/tramits-administratius
- Detalle: https://web.ub.edu/web/facultat-economia-empresa/w/acc%C3%A9s-als-estudis-de-grau-exceptuant-la-preinscripci%C3%B3-universit%C3%A0ria-?referer=tramits-administratius
"""

BUG_ISSUE_BODY = """### Jira (opcional)

_No response_

### 🐛 Descripción del problema

[PW-426](https://suport.ub.edu/browse/PW-426)

La pagina https://web.ub.edu/ca/web/escola-doctorat/comandament es de tipo "incrustada" i no se visualiza correctamente,

### 🔄 Comportamiento Actual

la pagina que se incrusta tiene un alto muy pequeño

<img width="3010" height="1400" alt="Image" src="https://github.com/user-attachments/assets/a3b78210-c559-4a0c-bda5-09bde3f72e0d" />

### 🎯 Comportamiento Esperado

el alto de la pagina deberia ajustarse a la pàgina que se incrustra

### 📝 Ejemplos / URLs afectadas

- https://web.ub.edu/ca/web/escola-doctorat/comandament

### Notas adicionales

_No response_
"""


class PrepareIssueTests(unittest.TestCase):
    def test_extract_issue_number_from_plain_number(self) -> None:
        self.assertEqual(prepare_issue.extract_issue_number("570"), 570)

    def test_extract_issue_number_from_url(self) -> None:
        self.assertEqual(
            prepare_issue.extract_issue_number(
                "https://github.com/mordonez/test-gitlab-migration/issues/570"
            ),
            570,
        )

    def test_extract_urls_normalizes_frontend_urls(self) -> None:
        self.assertEqual(
            prepare_issue.extract_urls(ISSUE_BODY),
            [
                "/web/facultat-economia-empresa/tramits-administratius",
                "/web/facultat-economia-empresa/w/acc%C3%A9s-als-estudis-de-grau-exceptuant-la-preinscripci%C3%B3-universit%C3%A0ria-?referer=tramits-administratius",
            ],
        )

    def test_extract_urls_normalizes_localized_web_paths(self) -> None:
        body = "- https://web.ub.edu/ca/web/escola-doctorat/comandament"
        self.assertEqual(
            prepare_issue.extract_urls(body),
            ["/web/escola-doctorat/comandament"],
        )

    def test_extract_heading_sections_normalizes_markdown_headings(self) -> None:
        sections = prepare_issue.extract_heading_sections(ISSUE_BODY)

        self.assertEqual(sections["site context"], "facultats")
        self.assertEqual(sections["descripción de la funcionalidad"], "Ajustes visuales.")
        self.assertEqual(sections["problema o necesidad"], "Hace falta mejorar el detalle.")

    def test_extract_json_object_ignores_task_prefix(self) -> None:
        raw_output = """task: [liferay] cd tools/cli && npm run dev -- liferay inventory page --url /foo --format json
{
  "pageType": "regularPage"
}
"""
        self.assertEqual(
            prepare_issue.extract_json_object(raw_output).strip(),
            '{\n  "pageType": "regularPage"\n}',
        )

    def test_build_issue_body_uses_bug_template_information(self) -> None:
        issue = {
            "number": 455,
            "title": "[Bug]: pagina incrustada. No se visualiza correctamente",
            "url": "https://github.com/mordonez/test-gitlab-migration/issues/455",
            "body": BUG_ISSUE_BODY,
        }
        inventories = [
            {
                "_requestedUrl": "/web/escola-doctorat/comandament",
                "pageType": "regularPage",
                "siteName": "Escola de Doctorat",
                "groupId": 7772917,
                "pageName": "Quadre de comandament",
                "layout": {
                    "layoutId": 101,
                    "plid": 2994,
                    "type": "embedded",
                },
                "widgets": [],
                "fragmentEntryLinks": [],
            }
        ]

        body = prepare_issue.build_issue_body(
            issue,
            ["/web/escola-doctorat/comandament"],
            inventories,
            "print",
        )

        self.assertIn("[PW-426](https://suport.ub.edu/browse/PW-426)", body)
        self.assertIn('La pagina https://web.ub.edu/ca/web/escola-doctorat/comandament es de tipo "incrustada"', body)
        self.assertIn("la pagina que se incrusta tiene un alto muy pequeño", body)
        self.assertIn("el alto de la pagina deberia ajustarse a la pàgina que se incrustra", body)
        self.assertIn("Escola de Doctorat", body)
        self.assertIn("configuración de página incrustada (`layout.type=embedded`)", body)
        self.assertIn("<!-- prepared-github-issues: source=455 -->", body)
        self.assertIn("### Texto original de la issue", body)
        self.assertIn("### 🔄 Comportamiento Actual", body)
        self.assertLess(body.index("### Texto original de la issue"), body.index("### Jira (opcional)"))
        self.assertNotIn("<details>", body)

    def test_issue_already_prepared_detects_marker(self) -> None:
        body = "<!-- prepared-github-issues: source=455 -->\n\nContenido"
        self.assertTrue(prepare_issue.issue_already_prepared(body, 455))
        self.assertFalse(prepare_issue.issue_already_prepared(body, 456))


if __name__ == "__main__":
    unittest.main()
