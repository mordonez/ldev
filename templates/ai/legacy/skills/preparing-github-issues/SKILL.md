---
name: preparing-github-issues
description: "Compatibility wrapper. Use when a GitHub issue has URLs or weak technical context and needs an intake pass before implementation."
---

# preparing-github-issues

Use this skill to enrich a GitHub issue with portal inventory before handing it
to an agent for implementation. A well-prepared issue saves the implementing
agent a full inventory pass.

For the full implementation lifecycle, delegate to `/issue-engineering`.

## When to use this skill

Use it when the issue body:
- contains portal URLs but no technical detail (structure keys, template IDs,
  bundle names, fragment keys)
- references a site or page by friendly name but not by discovered composition
- has a visual description of the problem but no mapping to source code surfaces

If the issue already has clear technical surfaces, skip this skill and go
directly to `/issue-engineering`.

## Option 1 — Direct discovery with ldev

Run discovery commands and paste the output into the issue body or a comment:

```bash
ldev context --json
ldev liferay inventory page --url <url> --json
ldev liferay inventory structures --site /<site> --json
ldev liferay inventory templates --site /<site> --json
```

For ADT resolution:

```bash
ldev liferay resource resolve-adt --display-style ddmTemplate_<ID> --site /<site> --json
```

This is the preferred approach for quick enrichment — no script needed.

## Option 2 — Enrichment script (project-installed)

If the project has the enrichment script installed, use it for bulk enrichment
that extracts all URLs from the issue body and appends a structured technical
context block:

```bash
# Print enriched body to stdout (safe, no mutations)
python3 .agents/skills/preparing-github-issues/scripts/prepare_issue.py NUM --mode print

# Create a companion test issue with enriched body (default mode)
python3 .agents/skills/preparing-github-issues/scripts/prepare_issue.py NUM --mode create-test

# Update the original issue body in place
python3 .agents/skills/preparing-github-issues/scripts/prepare_issue.py NUM --mode update-original
```

The script:
1. Reads the issue body from GitHub (requires `gh` CLI and repo access).
2. Extracts `/web/...` paths and full portal URLs from the body.
3. Runs `ldev liferay inventory page --url ... --json` for each URL.
4. Builds an enriched body with sections: source, site context, summary,
   problem, proposal, verified URLs, and technical context (surfaces found).
5. Skips issues that were already prepared (checks for a marker comment).

## Guardrails

- Prefer `--mode print` or `--mode create-test` over `--mode update-original`
  to avoid overwriting reporter-provided context.
- Do not run this skill on issues that already have a clear technical surface
  list — the extra enrichment adds noise, not value.
- The script requires an active `ldev` runtime. Run `ldev status --json` before
  invoking the script.
