---
name: developing-liferay
description: "Use when you need to change Liferay code, themes, structured content resources or fragment source in a project that runs with ldev."
---

# Developing Liferay

Use this skill for implementation work after the affected surface is already
clear.

## Required bootstrap

1. `ldev doctor`
2. `ldev context --json`
3. If the local env is not running yet: `ldev start`

## Discovery first

If the task mentions a site, page, structure, template, ADT or fragment, start
with portal discovery before editing code:

```bash
ldev liferay inventory sites --format json
ldev liferay inventory pages --site /<site> --format json
ldev liferay inventory page --url <fullUrl> --format json
ldev liferay resource resolve-adt --display-style ddmTemplate_<ID> --site /<site> --json
```

Use file exports when you need the current source of truth from the portal:

```bash
ldev liferay resource export-structure --site /<site> --key <STRUCTURE_KEY>
ldev liferay resource export-template --site /<site> --id <TEMPLATE_ID>
ldev liferay resource export-fragment --site /<site> --fragment <FRAGMENT_KEY>
```

## Choose the smallest implementation path

### Theme and frontend source

Use when the change is in SCSS, JS, theme templates or other packaged theme
assets.

```bash
ldev deploy theme
ldev logs --since 2m --service liferay --no-follow
```

### OSGi modules and Java

Use when the change lives in `modules/` or another deployable Gradle unit.

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
```

### Journal structures, templates and ADTs

Use the stable file-based resource workflows instead of ad hoc API calls.

```bash
ldev liferay resource import-structure --site /<site> --check-only
ldev liferay resource import-template --site /<site> --check-only
ldev liferay resource import-adt --site /<site> --check-only
```

When validation looks correct, run the same command without `--check-only`.

### Fragments

Treat fragments as versioned source plus explicit import workflow:

```bash
ldev liferay resource fragments --site /<site> --json
ldev liferay resource import-fragment --site /<site> --fragment <fragment-key> --check-only
```

If the project uses a separate fragment authoring flow outside `ldev`, follow
that project-owned workflow instead of inventing custom commands.

## Guardrails

- Use `ldev` as the entrypoint. Do not fall back to legacy `task ...` wrappers.
- Prefer the smallest deploy or import that proves the change.
- Do not guess IDs, keys or site names when `ldev liferay inventory ...` can resolve them.
- For scripts and agents, prefer `--json` on discovery and verification commands.
- If a command fails because the portal is not reachable, re-check with `ldev status --json` and start the env before deeper debugging.

## Minimum verification

- The changed artifact builds or validates successfully.
- `ldev logs --since 2m --no-follow` does not show new runtime errors caused by the change.
- If the change affects an OSGi bundle, `ldev osgi status <bundle>` reports the expected state.
- If the change affects portal resources, verify them again with `ldev liferay inventory ...` or `ldev liferay resource ...`.
