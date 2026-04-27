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

Before writing new FTL or DDM accessor logic, inspect the dominant pattern in
the repository first. Do not invent a new accessor style when the repo already
has a stable one. For the repository-backed export/import loop, read
`references/resource-workflow.md`.

## Decision: import vs. migrate

Use the standard file import workflow when the resource change is compatible
with existing data.

Switch to `migrating-journal-structures` before editing when existing Journal
content makes a direct import risky.


## Repository-backed resource workflow

When structures, templates, ADTs, or fragments should be reviewed in Git,
use this sequence:

```bash
# 1. Discover exact identifiers
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
ldev resource fragments --site /<site> --json

# 2. Export current state from portal
ldev resource export-structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource export-template --site /<site> --template <TEMPLATE_ID>
ldev resource export-adt --site /<site> --adt <ADT_KEY> --widget-type <widget-type>
ldev resource export-fragment --site /<site> --fragment <FRAGMENT_KEY>

# 3. Edit locally, then validate before import
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --template <TEMPLATE_ID> --check-only
ldev resource import-adt --site /<site> --file <path/to/adt.ftl> --check-only
# Note: import-fragment has no --check-only flag; validate the source file manually before importing
ldev resource import-fragment --site /<site> --fragment <fragment-key>

# 4. Apply the import (structures, templates, ADTs)
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource import-template --site /<site> --template <TEMPLATE_ID>
ldev resource import-adt --site /<site> --file <path/to/adt.ftl>
```

These resources live in the portal runtime. Do not run `ldev deploy theme`,
`ldev deploy module`, or a broad deploy for them; those commands will not
apply Journal templates, ADTs, fragments, or structures.

For bulk export/import, extended examples, and ADT/fragment-specific loops,
see `references/resource-workflow.md`.

## Choose the smallest implementation path

Choose the narrowest path that matches the changed surface:

**Theme and frontend source** (SCSS, JS, FreeMarker theme templates):

```bash
ldev deploy theme
ldev logs --since 2m --service liferay --no-follow
```

**OSGi modules and Java code:**

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
```

**Journal structures, templates, and ADTs:**
Use the repository-backed resource workflow above.

**Service Builder, Liferay Objects, and Fragments:**
For commands, decision criteria, and examples for these paths, see
`references/implementation-paths.md`.

## Portal configuration

To read or write portal properties and OSGi config from local files:

```bash
# Read one portal property or OSGi config PID
ldev portal config get <target> --json
ldev portal config get <target> --source source --json   # from source file, not effective

# Write one portal property
ldev portal config set <target> --value <value> --json

# Write one OSGi config key within a PID
ldev portal config set <pid> --key <key> --value <value> --json
```

Use `config get` before `config set` to confirm the current value. Do not
guess property keys — resolve them from the portal docs or from existing local
config files under `configs/`. Changes take effect after `ldev env restart`
or a portal restart.

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
- If the final handoff covers production promotion for templates, ADTs,
  structures, or fragments, write BOTH:
  1. The exact `ldev resource import-*` command with site and resource key.
  2. The equivalent manual Liferay UI fallback path (e.g. Site Menu → Design → Templates)
     so a human can apply the change without `ldev` access on production.
  Do not assume `ldev` is available on the target environment. For full wording
  templates and per-resource-type UI paths, see
  `references/runtime-resource-production-handoff.md`.

## Minimum verification

- The changed artifact builds or validates successfully.
- `ldev logs --since 2m --no-follow` does not show new runtime errors caused by the change.
- If the change affects an OSGi bundle, `ldev osgi status <bundle>` reports the expected state.
- If the change affects portal resources, verify them again with `ldev portal inventory ...` or `ldev resource ...`.
- If the change started from exported portal resources, verify that the repo now contains the intended source of truth.
- If the change affects rendered portal behavior, validate it with `playwright-cli` in the prepared runtime before calling it done.
