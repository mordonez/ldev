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
> Full field reference: `references/ldev-context.md`

## Discovery first

If the task mentions a site, page, structure, template, ADT or fragment, start
with portal discovery before editing code:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --json
ldev resource adt --display-style ddmTemplate_<ID> --site /<site> --json
```

Use file exports when you need the current source of truth from the portal:

```bash
ldev resource export-structure --site /<site> --key <STRUCTURE_KEY>
ldev resource export-template --site /<site> --id <TEMPLATE_ID>
ldev resource export-adt --site /<site> --key <ADT_KEY> --widget-type <widget-type>
ldev resource export-fragment --site /<site> --fragment <FRAGMENT_KEY>
```

## Repository-backed resource workflow

When structures, templates, ADTs, or fragments should be reviewed in Git, use
the full file workflow instead of editing through the UI.

These resources live in the portal runtime. Do not run `ldev deploy theme`,
`ldev deploy module`, or a broad deploy for them; those commands will not
apply Journal templates, ADTs, fragments, or structures. Use
`ldev resource import-*` against a prepared runtime and verify with browser
automation when the change affects rendered pages.

### 1. Discover exact identifiers

```bash
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
ldev resource fragments --site /<site> --json
```

### 2. Export current portal state

Use focused exports when changing one object:

```bash
ldev resource export-structure --site /<site> --key <STRUCTURE_KEY>
ldev resource export-template --site /<site> --id <TEMPLATE_ID>
ldev resource export-adt --site /<site> --key <ADT_KEY> --widget-type <widget-type>
ldev resource export-fragment --site /<site> --fragment <FRAGMENT_KEY>
```

If you intentionally need several resources, repeat the singular export command
per resource. Do not use plural export commands unless a human explicitly asked
for a bulk refresh and accepted the larger diff.

### 3. Edit the exported files locally

Review the exported resource files like any other source change.

Use resource migrations instead of plain imports when existing Journal content
makes the change risky:

- switch to `migrating-journal-structures`

### 4. Validate before mutating

Preview the local repository state first:

```bash
ldev resource import-structure --site /<site> --key <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --id <TEMPLATE_ID> --check-only
ldev resource import-adt --site /<site> --file <path/to/adt.ftl> --check-only
```

If you intentionally need to validate multiple files, repeat the singular
import command per changed resource so failures stay attributable.

### 5. Apply the smallest safe import

```bash
ldev resource import-structure --site /<site> --key <STRUCTURE_KEY>
ldev resource import-template --site /<site> --id <TEMPLATE_ID>
ldev resource import-adt --site /<site> --file <path/to/adt.ftl>
ldev resource import-fragment --site /<site> --fragment <fragment-key>
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

Run only after a confirmed Service Builder change to `service.xml` or the
generated service layer. This is broader than a module deploy, so do not use it
as a generic fix-up step. If a single generated module can prove the change, use
`ldev deploy module <module-name>` instead.

### Liferay Objects

Use for custom data models on DXP 7.4+ that need their own headless REST API
without traditional OSGi modules.

References:
- `references/objects.md` — field types, relationships, auto-generated API, Actions, Validations
- `references/oauth2-setup.md` — OAuth2 portal setup and `ldev oauth install --write-env`
- `references/headless-openapi.md` — local OpenAPI spec URLs for headless REST discovery

### Journal structures, templates and ADTs

Use the stable file-based resource workflows instead of ad hoc API calls.
Each command requires its identifier; use `--check-only` to preview before
mutating.

References:
- `references/structures.md` — CLI workflow (export, validate, import)
- `references/structure-field-catalog.md` — field type JSON catalog (use when authoring or editing structure JSON directly)
- `references/workflow.md` — approval workflow states, inspection, and publish failures

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
- Use `ldev deploy theme` only for theme changes.
- Use `ldev deploy module <module-name>` only for modules or deployable Gradle units.
- Use singular `ldev resource import-*` and `ldev resource export-*` commands for
  Journal templates, ADTs, fragments, and structures.
- Do not use plural resource commands or a broad deploy unless a human
  explicitly asks for a bulk operation and the risk is written down first.
- Do not guess IDs, keys or site names when `ldev portal inventory ...` can resolve them.
- For scripts and agents, prefer `--json` on all discovery and verification commands.
- If a command fails because the portal is not reachable, re-check with `ldev status --json` and start the env before deeper debugging.

## Minimum verification

- The changed artifact builds or validates successfully.
- `ldev logs --since 2m --no-follow` does not show new runtime errors caused by the change.
- If the change affects an OSGi bundle, `ldev osgi status <bundle>` reports the expected state.
- If the change affects portal resources, verify them again with `ldev portal inventory ...` or `ldev resource ...`.
- If the change started from exported portal resources, verify that the repo now contains the intended source of truth.
- If the change affects rendered portal behavior, validate it with `playwright-cli` in the prepared runtime before calling it done.
