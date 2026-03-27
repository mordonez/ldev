#!/usr/bin/env python3

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
PREPARED_MARKER_PREFIX = "<!-- prepared-github-issues:"


def run_command(args: list[str]) -> str:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = strip_ansi(result.stderr).strip()
        stdout = strip_ansi(result.stdout).strip()
        detail = stderr or stdout or f"Command failed: {' '.join(args)}"
        raise RuntimeError(detail)

    return strip_ansi(result.stdout)


def strip_ansi(value: str) -> str:
    return ANSI_ESCAPE_RE.sub("", value)


def build_prepared_marker(issue_number: int) -> str:
    return f"{PREPARED_MARKER_PREFIX} source={issue_number} -->"


def issue_already_prepared(body: str, issue_number: int) -> bool:
    return build_prepared_marker(issue_number) in body


def extract_issue_number(value: str) -> int:
    stripped = value.strip()

    if stripped.isdigit():
        return int(stripped)

    match = re.search(r"/issues/(\d+)", stripped)
    if match:
        return int(match.group(1))

    raise ValueError(f"Unsupported issue reference: {value}")


def extract_urls(body: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    for match in re.finditer(r"(https?://[^\s)>\]]+|/web/[^\s)>\]]+)", body):
        candidate = match.group(1).rstrip(".,")
        normalized = normalize_frontend_url(candidate)
        if normalized and normalized not in seen:
            seen.add(normalized)
            urls.append(normalized)

    return urls


def normalize_frontend_url(value: str) -> str | None:
    if value.startswith("/web/") or re.match(r"^/[a-z]{2}/web/", value):
        return canonicalize_site_path(strip_fragment(value))

    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return None

    if not (parsed.path.startswith("/web/") or re.match(r"^/[a-z]{2}/web/", parsed.path)):
        return None

    path = parsed.path
    if parsed.query:
        path = f"{path}?{parsed.query}"

    return canonicalize_site_path(strip_fragment(path))


def strip_fragment(value: str) -> str:
    return value.split("#", 1)[0]


def canonicalize_site_path(value: str) -> str:
    return re.sub(r"^/[a-z]{2}/web/", "/web/", value)


def extract_heading_sections(body: str) -> dict[str, str]:
    matches = list(re.finditer(r"^###\s+(.+)$", body, flags=re.MULTILINE))
    if not matches:
        return {}

    sections: dict[str, str] = {}

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        raw_heading = match.group(1).strip()
        key = canonical_heading(raw_heading)
        sections[key] = body[start:end].strip()

    return sections


def canonical_heading(value: str) -> str:
    lowered = value.lower()
    cleaned = re.sub(r"[^a-z0-9áéíóúüñ ]+", " ", lowered)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def parse_inventory(url: str) -> dict[str, Any]:
    raw_output = run_command(
        ["task", "liferay", "--", "inventory", "page", "--url", url, "--format", "json"]
    )
    json_text = extract_json_object(raw_output)
    data = json.loads(json_text)
    data["_requestedUrl"] = url
    return data


def extract_json_object(raw_output: str) -> str:
    first_brace = raw_output.find("{")
    if first_brace == -1:
        raise RuntimeError("Inventory command did not return JSON output")

    return raw_output[first_brace:]


def summarize_regular_page(data: dict[str, Any]) -> tuple[list[str], list[str]]:
    lines: list[str] = []
    surfaces: list[str] = []

    layout = data.get("layout") or {}
    if layout:
        lines.append(
            f"- Layout: `{layout.get('type', 'unknown')}` (layoutId `{layout.get('layoutId')}`, plid `{layout.get('plid')}`)"
        )
        if layout.get("type") == "embedded":
            lines.append("- Página incrustada detectada")
            surfaces.append("configuración de página incrustada (`layout.type=embedded`)")

    widgets = data.get("widgets") or []
    fragment_links = data.get("fragmentEntryLinks") or []

    search_results = next(
        (
            widget
            for widget in widgets
            if widget.get("portletId")
            == "com_liferay_portal_search_web_search_results_portlet_SearchResultsPortlet"
        ),
        None,
    )
    if search_results:
        display_style = (search_results.get("configuration") or {}).get("displayStyle")
        if display_style:
            lines.append(f"- Search Results ADT: `{display_style}`")
            surfaces.append(f"ADT de resultados de búsqueda `{display_style}`")

    search_bar = next(
        (
            widget
            for widget in widgets
            if widget.get("portletId")
            == "com_liferay_portal_search_web_search_bar_portlet_SearchBarPortlet"
        ),
        None,
    )
    if search_bar:
        display_style = (search_bar.get("configuration") or {}).get("displayStyle")
        if display_style:
            lines.append(f"- Search Bar display style: `{display_style}`")
            surfaces.append(f"configuración del buscador `{display_style}`")

    custom_filters = [
        widget
        for widget in widgets
        if widget.get("portletId")
        == "com_liferay_portal_search_web_internal_custom_filter_portlet_CustomFilterPortlet"
    ]
    for custom_filter in custom_filters:
        config = custom_filter.get("configuration") or {}
        field = config.get("filterField")
        value = config.get("filterValue")
        if field and value:
            lines.append(f"- Custom filter: `{field}={value}`")
            if field == "ddmStructureKey":
                surfaces.append(f"estructura DDM `{value}`")

    category_facets = [
        widget
        for widget in widgets
        if widget.get("portletId")
        == "com_liferay_portal_search_web_category_facet_portlet_CategoryFacetPortlet"
    ]
    if category_facets:
        facet_names = [
            (facet.get("configuration") or {}).get("parameterName")
            for facet in category_facets
            if (facet.get("configuration") or {}).get("parameterName")
        ]
        if facet_names:
            lines.append(
                "- Category facets: " + ", ".join(f"`{facet_name}`" for facet_name in facet_names)
            )

    fragment_keys = []
    for entry in fragment_links:
        key = entry.get("fragmentKey")
        if key and key not in fragment_keys:
            fragment_keys.append(key)

    if fragment_keys:
        preview = ", ".join(f"`{key}`" for key in fragment_keys[:4])
        lines.append(f"- Fragments presentes: {preview}")

    return lines, surfaces


def summarize_display_page(data: dict[str, Any]) -> tuple[list[str], list[str]]:
    lines: list[str] = []
    surfaces: list[str] = []

    content_structure = data.get("contentStructure") or {}
    if content_structure:
        key = content_structure.get("key")
        name = content_structure.get("name")
        lines.append(
            f"- Estructura de contenido: `{key}` ({name})"
        )
        if key:
            surfaces.append(f"estructura DDM `{key}`")

    article_properties = data.get("articleProperties") or {}
    basic_info = article_properties.get("basicInfo") or {}
    journal_article = data.get("journalArticle") or {}
    article_id = basic_info.get("identifier") or journal_article.get("key")
    article_title = data.get("articleTitle") or journal_article.get("title")
    if article_id or article_title:
        lines.append(f"- Web Content: `{article_id}` ({article_title})")

    folder_breadcrumb = data.get("folderBreadcrumb")
    if folder_breadcrumb:
        lines.append(f"- Carpeta: `{folder_breadcrumb}`")

    default_template_key = basic_info.get("defaultTemplateKey")
    if default_template_key:
        lines.append(f"- Default template del artículo: `{default_template_key}`")
        surfaces.append(f"template del artículo `{default_template_key}`")

    display_page_template = journal_article.get("displayPageTemplate") or {}
    if display_page_template:
        key = display_page_template.get("key")
        file_name = display_page_template.get("file")
        title = display_page_template.get("title")
        lines.append(
            f"- Display Page Template: `{key}` ({title})"
            + (f", archivo `{file_name}`" if file_name else "")
        )
        if file_name:
            surfaces.append(f"display page template `{file_name}`")

    content_templates = journal_article.get("contentTemplates") or []
    template_ids = [template.get("id") for template in content_templates if template.get("id")]
    if template_ids:
        lines.append(
            "- Templates asociadas: " + ", ".join(f"`{template_id}`" for template_id in template_ids)
        )

    categorization = article_properties.get("categorization") or {}
    public_categories = categorization.get("publicCategories") or []
    for vocabulary in public_categories:
        name = vocabulary.get("vocabulary")
        categories = vocabulary.get("categories") or []
        if name and categories:
            joined = ", ".join(categories)
            lines.append(f"- Categorías públicas `{name}`: {joined}")

    return lines, surfaces


def summarize_inventory(data: dict[str, Any]) -> tuple[list[str], list[str]]:
    lines = [
        f"- Tipo de página: `{data.get('pageType', 'unknown')}`",
        f"- Site: `{data.get('siteName', 'unknown')}` (groupId `{data.get('groupId', 'unknown')}`)",
    ]
    page_name = data.get("pageName")
    if page_name:
        lines.append(f"- Página: `{page_name}`")

    page_type = data.get("pageType")
    surfaces: list[str] = []

    if page_type == "regularPage":
        detail_lines, surfaces = summarize_regular_page(data)
    elif page_type == "displayPage":
        detail_lines, surfaces = summarize_display_page(data)
    else:
        detail_lines = []

    lines.extend(detail_lines)
    return lines, surfaces


def dedupe_preserve_order(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value not in seen:
            seen.add(value)
            deduped.append(value)
    return deduped


def is_empty_placeholder(value: str | None) -> bool:
    if value is None:
        return True
    normalized = value.strip()
    return not normalized or normalized == "_No response_"


def first_meaningful_section(sections: dict[str, str], keys: list[str], default: str) -> str:
    for key in keys:
        value = sections.get(key)
        if not is_empty_placeholder(value):
            return value.strip()
    return default


def extract_jira_reference(body: str) -> str | None:
    link_match = re.search(r"\[(PW-\d+)\]\((https?://[^\s)]+)\)", body)
    if link_match:
        return f"[{link_match.group(1)}]({link_match.group(2)})"

    plain_match = re.search(r"\b(PW-\d+)\b", body)
    if plain_match:
        return plain_match.group(1)

    return None


def remove_jira_reference(value: str, jira_reference: str | None) -> str:
    if is_empty_placeholder(value) or not jira_reference:
        return value

    cleaned = re.sub(r"^\s*\[PW-\d+\]\((https?://[^\s)]+)\)\s*\n*", "", value, count=1).strip()
    return cleaned or value


def build_issue_body(
    issue: dict[str, Any], urls: list[str], inventories: list[dict[str, Any]], mode: str
) -> str:
    original_body = issue.get("body", "").strip()
    sections = extract_heading_sections(original_body)

    jira = first_meaningful_section(sections, ["jira opcional"], "")
    if is_empty_placeholder(jira):
        jira = extract_jira_reference(original_body) or "_No aportado en la issue original._"

    description = first_meaningful_section(
        sections,
        ["descripción de la funcionalidad", "descripción del problema"],
        "_No aportada en la issue original._",
    )
    description = remove_jira_reference(description, jira)

    problem = first_meaningful_section(
        sections,
        ["problema o necesidad", "comportamiento actual"],
        "_No aportado en la issue original._",
    )
    proposal = first_meaningful_section(
        sections,
        ["propuesta de solución", "comportamiento esperado"],
        "_No aportada en la issue original._",
    )
    notes = first_meaningful_section(sections, ["notas adicionales"], "")

    inventory_chunks: list[str] = []
    surfaces: list[str] = []

    for data in inventories:
        url = data["_requestedUrl"]
        lines, candidate_surfaces = summarize_inventory(data)
        inventory_chunks.append(f"#### `{url}`\n" + "\n".join(lines))
        surfaces.extend(candidate_surfaces)

    surfaces = dedupe_preserve_order(surfaces)
    surfaces_block = "\n".join(f"- {surface}" for surface in surfaces) if surfaces else "- `NO_VERIFICADO`"
    urls_block = "\n".join(f"- `{url}`" for url in urls)
    site_names = dedupe_preserve_order(
        [data.get("siteName", "").strip() for data in inventories if data.get("siteName")]
    )
    site_context = first_meaningful_section(
        sections,
        ["site context"],
        ", ".join(site_names) if site_names else "_No aportado en la issue original._",
    )

    if mode == "create-test":
        mode_note = "Se ha generado como issue de comparación para revisar el resultado antes de editar la original."
    elif mode == "update-original":
        mode_note = "Este contenido está preparado para sustituir la issue original."
    else:
        mode_note = "Esta es una previsualización del contenido enriquecido antes de publicarlo."

    body_parts = [
        f"### Issue fuente\n- Original: #{issue['number']} ({issue['url']})\n- Título original: {issue['title']}\n- Modo: {mode_note}",
    ]

    if original_body:
        body_parts.append(f"### Texto original de la issue\n{original_body}")

    body_parts.extend([
        f"### Jira (opcional)\n{jira}",
        f"### Contexto de site\n{site_context}",
        f"### Resumen funcional\n{description}",
        f"### Problema o necesidad\n{problem}",
        f"### Propuesta inicial\n{proposal}",
        f"### URLs afectadas verificadas\n{urls_block}",
        "### Contexto técnico inventariado automáticamente\n" + "\n\n".join(inventory_chunks),
        f"### Superficies candidatas para resolver la incidencia\n{surfaces_block}",
    ])

    if notes:
        body_parts.append(f"### Notas originales conservadas\n{notes}")

    body_parts.append(
        "### Preparación para `/resolving-issues`\n"
        "- La issue ya incluye site, URLs verificadas y superficies técnicas candidatas.\n"
        "- Antes de implementar, reproducir el síntoma exacto en local y confirmar qué recurso es el responsable real.\n"
        "- No asumir que todas las superficies listadas requieren cambios; son puntos de inspección inicial."
    )

    marker = build_prepared_marker(issue["number"])
    return marker + "\n\n" + "\n\n".join(body_parts).strip() + "\n"


def create_or_update_issue(
    issue: dict[str, Any], body: str, mode: str, title_prefix: str
) -> str:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".md", delete=False) as handle:
        temp_path = Path(handle.name)
        handle.write(body)

    try:
        if mode == "update-original":
            output = run_command(
                ["gh", "issue", "edit", str(issue["number"]), "--title", issue["title"], "--body-file", str(temp_path)]
            )
            return output.strip() or issue["url"]

        title = f"{title_prefix} #{issue['number']}: {issue['title']}"
        output = run_command(["gh", "issue", "create", "--title", title, "--body-file", str(temp_path)])
        return output.strip()
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare GitHub issues with Liferay inventory context.")
    parser.add_argument("issue", help="Issue number or issue URL")
    parser.add_argument(
        "--mode",
        choices=["create-test", "update-original", "print"],
        default="update-original",
        help="update-original edits the source issue, create-test creates a comparison issue, print writes the body to stdout",
    )
    parser.add_argument(
        "--title-prefix",
        default="[Prepared Issue]",
        help="Title prefix used when creating a comparison issue",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate the prepared issue even if it was already prepared before",
    )
    args = parser.parse_args()

    issue_number = extract_issue_number(args.issue)
    issue = json.loads(
        run_command(
            ["gh", "issue", "view", str(issue_number), "--json", "number,title,body,url,labels"]
        )
    )

    if args.mode != "create-test" and issue_already_prepared(issue.get("body", ""), issue_number) and not args.force:
        print(f"SKIP: issue #{issue_number} is already prepared. Use --force to regenerate.")
        return 0

    urls = extract_urls(issue.get("body", ""))
    if not urls:
        raise RuntimeError("No frontend URLs were found in the issue body")

    inventories = [parse_inventory(url) for url in urls]
    body = build_issue_body(issue, urls, inventories, args.mode)

    if args.mode == "print":
        sys.stdout.write(body)
        return 0

    result = create_or_update_issue(issue, body, args.mode, args.title_prefix)
    print(result)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
