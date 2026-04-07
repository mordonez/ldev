#!/usr/bin/env python3

import argparse
import json
import re
import subprocess
import sys
from typing import Any
from urllib.parse import urlparse


ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def strip_ansi(value: str) -> str:
    return ANSI_ESCAPE_RE.sub("", value)


def run_command(args: list[str]) -> str:
    result = subprocess.run(args, capture_output=True, text=True)

    if result.returncode != 0:
        stderr = strip_ansi(result.stderr).strip()
        stdout = strip_ansi(result.stdout).strip()
        detail = stderr or stdout or f"Command failed: {' '.join(args)}"
        raise RuntimeError(detail)

    return strip_ansi(result.stdout)


def extract_issue_number(value: str) -> int:
    stripped = value.strip()

    if stripped.isdigit():
        return int(stripped)

    match = re.search(r"/issues/(\d+)", stripped)
    if match:
        return int(match.group(1))

    raise ValueError(f"Unsupported issue reference: {value}")


def strip_fragment(value: str) -> str:
    return value.split("#", 1)[0]


def canonicalize_site_path(value: str) -> str:
    return re.sub(r"^/[a-z]{2}/web/", "/web/", value)


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


def extract_json_object(raw_output: str) -> str:
    first_brace = raw_output.find("{")
    if first_brace == -1:
        raise RuntimeError("Command did not return JSON output")

    return raw_output[first_brace:]


def load_issue(issue_number: int) -> dict[str, Any]:
    raw = run_command(
        ["gh", "issue", "view", str(issue_number), "--json", "title,body,labels,comments"]
    )
    return json.loads(raw)


def parse_inventory(url: str) -> dict[str, Any]:
    raw_output = run_command(
        ["ldev", "portal", "inventory", "page", "--url", url, "--json"]
    )
    data = json.loads(extract_json_object(raw_output))
    data["_requestedUrl"] = url
    return data


def summarize_inventory(data: dict[str, Any]) -> list[str]:
    lines: list[str] = []

    site = data.get("site") or {}
    layout = data.get("layout") or {}
    admin_urls = data.get("adminUrls") or {}

    if site.get("friendlyUrl"):
        lines.append(f"- Site: `{site['friendlyUrl']}`")

    if data.get("_requestedUrl"):
        lines.append(f"- URL: `{data['_requestedUrl']}`")

    if layout:
        layout_id = layout.get("layoutId")
        plid = layout.get("plid")
        layout_type = layout.get("type", "unknown")
        lines.append(f"- Layout: `{layout_type}` (layoutId `{layout_id}`, plid `{plid}`)")

    if admin_urls.get("Edit URL"):
        lines.append("- Page Editor available")

    widgets = data.get("widgets") or []
    for widget in widgets:
        config = widget.get("configuration") or {}
        display_style = config.get("displayStyle")
        if display_style and str(display_style).startswith("ddmTemplate_"):
            lines.append(f"- ADT detected: `{display_style}`")
            break

    content_structure = data.get("contentStructure") or {}
    if content_structure.get("key"):
        lines.append(f"- Content structure: `{content_structure['key']}`")

    return lines


def build_report(issue: dict[str, Any], issue_number: int) -> str:
    body = issue.get("body") or ""
    urls = extract_urls(body)

    sections: list[str] = []
    sections.append(f"# Prepared issue {issue_number}")
    sections.append("")
    sections.append("## Summary")
    sections.append(f"- Title: {issue.get('title', '').strip()}")
    sections.append(f"- URLs found: {len(urls)}")

    if not urls:
        sections.append("- No exact portal URLs found in the issue body")

    sections.append("")
    sections.append("## Verified context")

    if not urls:
        sections.append("- NOT_VERIFIED: no resolvable `/web/...` URL found")
    else:
        for url in urls:
            sections.append(f"### {url}")
            try:
                inventory = parse_inventory(url)
                sections.extend(summarize_inventory(inventory))
            except Exception as error:
                sections.append(f"- NOT_VERIFIED: {error}")
            sections.append("")

    sections.append("## Next steps")
    sections.append("- Reproduce the issue locally from the isolated worktree")
    sections.append("- Resolve resource/template/module ownership before editing")
    sections.append("- Keep any unresolved scope marked as `NOT_VERIFIED`")

    return "\n".join(sections).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare a GitHub issue with verified Liferay context")
    parser.add_argument("issue", help="Issue number or GitHub issue URL")
    args = parser.parse_args()

    try:
        issue_number = extract_issue_number(args.issue)
        issue = load_issue(issue_number)
        sys.stdout.write(build_report(issue, issue_number))
        return 0
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
