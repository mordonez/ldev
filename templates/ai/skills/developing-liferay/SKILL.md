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

> `ldev context --json` returns `paths.*` (local resource dirs), `env.portalUrl`,
> `liferay.oauth2Configured` and `commands.*` (which namespaces are ready — includes
> `commands.portal` and `commands.resource`). Use these values to resolve paths and
> verify auth before running any portal command.

## Discovery first

If the task mentions a site, page, structure, template, ADT or fragment, start
with portal discovery before editing code:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --json
ldev resource resolve-adt --display-style ddmTemplate_<ID> --site /<site> --json
```

Use file exports when you need the current source of truth from the portal:

```bash
ldev resource export-structure --site /<site> --key <STRUCTURE_KEY>
ldev resource export-template --site /<site> --id <TEMPLATE_ID>
ldev resource export-fragment --site /<site> --fragment <FRAGMENT_KEY>
```

## Choose the smallest implementation path

### Theme and frontend source

Use when the change is in SCSS, JS, theme templates or other packaged theme
assets.

Reference: `references/theme.md`

```bash
ldev deploy theme
ldev logs --since 2m --service liferay --no-follow
```

### OSGi modules and Java

Use when the change lives in `modules/` or another deployable Gradle unit.

References:
- `references/osgi.md`
- `references/extending-liferay.md`

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
```

### Service Builder

Run after any change to `service.xml` or portlet service layer.

```bash
ldev deploy service
```

### Journal structures, templates and ADTs

Use the stable file-based resource workflows instead of ad hoc API calls.
Each command requires its identifier; use `--check-only` to preview before
mutating.

References:
- `references/structures.md` — CLI workflow (export, validate, import)
- `references/structure-field-catalog.md` — field type JSON catalog (use when authoring or editing structure JSON directly)

```bash
ldev resource import-structure --site /<site> --key <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --id <TEMPLATE_ID> --check-only
ldev resource import-adt --site /<site> --file <path/to/adt.ftl> --check-only
```

When validation looks correct, run the same command without `--check-only`.

### Fragments

Treat fragments as versioned source plus explicit import workflow:

Reference: `references/fragments.md`

```bash
ldev resource fragments --site /<site> --json
ldev resource import-fragment --site /<site> --fragment <fragment-key>
```

> `import-fragment` has no `--check-only` flag. Validate the fragment source
> file manually before importing.

If the project uses a separate fragment authoring flow outside `ldev`, follow
that project-owned workflow instead of inventing custom commands.

## Guardrails

- Use `ldev` as the entrypoint.
- Prefer the smallest deploy or import that proves the change.
- Do not guess IDs, keys or site names when `ldev portal inventory ...` can resolve them.
- For scripts and agents, prefer `--json` on all discovery and verification commands.
- If a command fails because the portal is not reachable, re-check with `ldev status --json` and start the env before deeper debugging.

## Minimum verification

- The changed artifact builds or validates successfully.
- `ldev logs --since 2m --no-follow` does not show new runtime errors caused by the change.
- If the change affects an OSGi bundle, `ldev osgi status <bundle>` reports the expected state.
- If the change affects portal resources, verify them again with `ldev portal inventory ...` or `ldev resource ...`.
