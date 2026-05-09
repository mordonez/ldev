---
name: developing-liferay
description: 'Guides implementation changes in Liferay projects that run with ldev. Use when the affected code, theme, module, config, structured content resource, or fragment source is known and must be edited.'
---

# Developing Liferay

Use this skill after the affected surface is clear. For issue-scale work, the
outer gate owner should be `runtime-change-workflow`.

## Bootstrap

```bash
ldev ai bootstrap --intent=develop --cache=60 --json
```

Inspect:

- `context.liferay.version` and `context.liferay.edition`
- `context.paths.resources.*`
- `context.liferay.auth.oauth2.*.status`
- `context.commands.*`
- `doctor.readiness.*`

If these fields are missing, stop and report that the installed `ldev` AI assets
are out of sync with the CLI.

## Discover Before Editing

If the task mentions a site, page, URL, structure, template, ADT, or fragment,
resolve it with the portal discovery contract in
[../../docs/PORTAL_DISCOVERY.md](../../docs/PORTAL_DISCOVERY.md) before code
search or edits.

Use local `ldev` MCP tools for read-only inventory when visible. Use the CLI for
file exports/imports and all mutations.

## Choose The Implementation Path

- Theme SCSS, JS, or theme FreeMarker -> `references/theme.md`
- OSGi module or Java code -> `references/osgi.md`
- Extension point selection -> `references/extending-liferay.md`
- Liferay Objects -> `references/objects.md`
- Workflow or publication state -> `references/workflow.md`
- Headless/Groovy/OAuth2 support -> related files under `references/`
- Structures/templates/ADTs/fragments -> `portal-resource-workflow`
- Journal data movement or incompatible structure change -> `migrating-journal-structures`

For the broader command mapping, read `references/implementation-paths.md`.

## Apply The Matching Runtime Action

File edits alone are still Red. After editing, run the smallest matching action:

- changed deployable module -> `ldev deploy module <module-name>`
- changed theme assets/templates -> `ldev deploy theme`
- changed Journal structure/template/ADT/fragment -> `portal-resource-workflow`
- changed portal properties or source OSGi config -> restart, then read back

If more than one surface changed, apply and verify each surface separately.

## Resource Boundary

For structures, templates, ADTs, and fragments, do not use deploy commands.
Switch to `portal-resource-workflow`, which owns source-of-truth resolution,
export/import, import-vs-migration, read-after-write, and browser validation.

For production promotion notes for runtime-backed resources, use
`references/runtime-resource-production-handoff.md`.

## Minimum Verification

- Changed artifact builds, imports, or validates successfully.
- Fresh logs do not show the original error pattern.
- Bundles are checked with `ldev osgi status/diag` when applicable.
- Portal resources are read back from runtime after import.
- Rendered behavior is validated in a browser when user-facing.

## Guardrails

- Use `ldev` as the entrypoint.
- Prefer `--json` for agent-consumed output.
- Prefer the smallest deploy/import/restart that proves the change.
- Do not guess IDs, keys, site names, or property keys when `ldev` can resolve them.
- Before deployment or runtime proof, switch to `deploying-liferay` when that is
  the only remaining work.
