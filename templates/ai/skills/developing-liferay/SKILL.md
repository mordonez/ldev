---
name: developing-liferay
description: 'Use when you need to change Liferay code, themes, structured content resources or fragment source in a project that runs with ldev.'
---

# Developing Liferay

Use this skill for implementation work after the affected surface is already
clear.

## Required bootstrap

```bash
ldev ai bootstrap --intent=develop --cache=60 --json
```

This returns `context` (offline project facts) and `doctor.readiness` (whether
the commands this skill uses are ready). Inspect:

- `context.liferay.version` and `context.liferay.edition` — portal APIs differ.
- `context.paths.resources.*` — resource dirs for import/export.
- `context.liferay.auth.oauth2.clientId.status` and `clientSecret.status` —
  `"present"` means ldev has credentials configured.
- `context.commands.*` — command support and missing requirements.
- `doctor.readiness.*` — cheap readiness summary; runtime-oriented commands stay
  `"unknown"` until you run deploy/runtime probes.

Do not run `ldev doctor` as generic bootstrap. Use it only when readiness or
diagnosis matters.

`develop` keeps `doctor` intentionally cheap: it validates repo/config/tool
presence and command readiness for local editing, but it does not run runtime,
portal, or OSGi probes. When those matter, call `ldev doctor --runtime`,
`ldev doctor --portal`, or `ldev doctor --osgi` explicitly.

## Bootstrap fields

- Required fields: `context.liferay.version`, `context.paths.resources.*`,
  `context.liferay.auth.oauth2.*.status`, `doctor.readiness.*`.
- If any of those fields is missing, stop and report that the installed `ldev`
  AI assets are out of sync with the CLI.

## Fast path

If `ldev ai bootstrap --intent=develop --cache=60 --json` shows the required
resource directory exists, OAuth2 credentials are present, and the relevant
`context.commands.*` entry is supported, proceed with the smallest relevant
edit or resource command.

Before deployment or runtime verification, switch to:

```bash
ldev ai bootstrap --intent=deploy --json
```

## Discovery first

If the task mentions a site, page, structure, template, ADT or fragment, start
with portal discovery before editing code:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --json
ldev resource adt --display-style ddmTemplate_<ID> --site /<site> --json
```

If you are inside a worktree and the main runtime is still the source of truth
for discovery, keep your shell in the worktree and call the global form:

```bash
ldev --repo-root <main-root> portal inventory page --url <fullUrl> --json
ldev --repo-root <main-root> ai bootstrap --intent=develop --cache=60 --json
```

Use file exports when you need the current source of truth from the portal:

```bash
ldev resource export-structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource export-template --site /<site> --template <TEMPLATE_ID>
ldev resource export-adt --site /<site> --adt <ADT_KEY> --widget-type <widget-type>
ldev resource export-fragment --site /<site> --fragment <FRAGMENT_KEY>
```

### Pattern discovery before writing FTL or DDM logic

Before writing any new FreeMarker template logic or DDM field accessor, grep
the repository for the canonical pattern used for that field type:

```bash
# Find how the repo reads boolean or checkbox DDM fields
grep -rE "getterUtil|getData|has_content" . --include="*.ftl" -l
grep -rE "getterUtil" . --include="*.ftl" -n | head -20

# Find existing examples for a specific field name
grep -rE "<DDM_FIELD_NAME>" . --include="*.ftl" -n
```

Do not invent a new accessor pattern. Copy the dominant pattern from existing
files.

Common pitfall: using `?has_content` on a boolean DDM field returns `true` even
when the field value is `false`, because the string `"false"` is non-empty. Use
`getterUtil.getBoolean(fieldVar.getData())` instead for boolean DDM fields.

## Decision: import vs. migrate

Use the standard file import workflow when the resource change is compatible
with existing data.

Switch to `migrating-journal-structures` before editing when existing Journal
content makes a direct import risky.

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
ldev resource export-structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource export-template --site /<site> --template <TEMPLATE_ID>
ldev resource export-adt --site /<site> --adt <ADT_KEY> --widget-type <widget-type>
ldev resource export-fragment --site /<site> --fragment <FRAGMENT_KEY>
```

If you intentionally need several resources, repeat the singular export command
per resource. Do not use plural export commands unless a human explicitly asked
for a bulk refresh and accepted the larger diff.

### 3. Edit the exported files locally

Review the exported resource files like any other source change.

### 4. Validate before mutating

Preview the local repository state first:

```bash
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --template <TEMPLATE_ID> --check-only
ldev resource import-adt --site /<site> --file <path/to/adt.ftl> --check-only
```

**`--check-only` semantics:** This flag passes only when the local file is
byte-identical to what the portal already has stored. It is a drift-detection
tool, not a pre-import validator. If you have modified the file, `--check-only`
will always report a hash mismatch — that is expected and correct behavior, not
an error. Do not interpret a mismatch as a sign that the import will fail.
Proceed to step 5 (the actual import) after reviewing the diff.

If you intentionally need to validate multiple files, repeat the singular
import command per changed resource so failures stay attributable.

### 5. Apply the smallest safe import

```bash
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource import-template --site /<site> --template <TEMPLATE_ID>
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
- `references/groovy-console.md` — portal console scripts, ERC vocabulary fixes, bulk operations with no `ldev` equivalent

```bash
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --template <TEMPLATE_ID> --check-only
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
