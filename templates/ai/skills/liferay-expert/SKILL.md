---
name: liferay-expert
description: 'Routes technical Liferay work to the right ldev specialist workflow. Use when the task involves Liferay and it is not yet clear whether the next step is diagnosis, implementation, deployment, resource import, or migration.'
---

# Liferay Expert

This is the domain router for reusable `ldev` Liferay workflows. Classify quickly and hand off; deep playbooks live in specialist skills.

## Bootstrap

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
```

Use `bootstrap.context` to route:

- `context.commands.*` for supported command namespaces.
- `context.liferay.portalUrl` for the effective local portal URL.
- `context.liferay.auth.oauth2.*.status` for configured credentials.
- `context.paths.resources.*` for local resource directories.

If required fields are missing, stop and report that the installed `ldev` AI assets are out of sync with the CLI.

## Resolve Runtime Context

If the task mentions a site, page, URL, structure, template, ADT, or fragment, resolve it with the portal discovery contract in [../../docs/PORTAL_DISCOVERY.md](../../docs/PORTAL_DISCOVERY.md) before searching or editing.

## Routing

- Issue/feature work with mutation risk -> `runtime-change-workflow`
- Unknown failure or unhealthy runtime -> `troubleshooting-liferay`
- Known code/theme/module/config implementation -> `developing-liferay`
- Journal structures, Journal templates, ADTs, or fragments -> `portal-resource-workflow`
- Existing change needing build, deploy, import, or runtime proof -> `deploying-liferay`
- Journal structure change with data movement or compatibility risk -> `migrating-journal-structures`
- Browser reproduction or visual proof -> `automating-browser-tests`

For deeper routing examples, read `references/routing.md`. For Display Page Templates, Navigation Menus, multi-site ownership, and content volume checks, read `references/site-objects.md`.

## Command Boundaries

- `ldev context --json`: offline repo/config facts.
- `ldev status --json`: Docker/runtime state.
- `ldev doctor --json`: active checks and readiness; add `--runtime`, `--portal`, or `--osgi` when that surface matters.
- `ldev portal inventory ... --json`: resolve site, page, structure, template, ADT, and where-used context before edits.

Do not substitute these commands for each other in plans or handoffs.

Use `inventory structures --with-templates` for structure/template discovery, `inventory page --url <fullUrl> --json --full` only when routing needs expanded page details, and `inventory where-used` when the task starts from a known key and needs impact analysis. Prefer `--site` unless a cross-site answer is required.

MCP equivalents when visible: `liferay_inventory_page`, `liferay_inventory_structures`, `liferay_inventory_templates`.

## AI asset maintenance

When skills or agent context files are out of date, run `ldev ai status --target <project-root> --json` first, then `ldev ai update --target <project-root>` or `ldev ai update --target <project-root> --skill <skill-name>`.

## OAuth2 prerequisite

Most portal and resource commands require OAuth2 credentials. If `context.liferay.auth.oauth2.clientId.status` is not `"present"`, set up credentials first:

```bash
ldev start
ldev oauth install --write-env
```

`--write-env` persists the credentials to `.liferay-cli.local.yml`. If the admin account is in password-reset state, unblock it first:

```bash
ldev oauth admin-unblock
```

## Guardrails

- Use `ldev` as the official interface.
- Prefer local `ldev` MCP tools for read-only discovery when visible; fall back to CLI with `--json`.
- Do not invent portal mutations when an `ldev resource ...` workflow exists.
- Keep the smallest specialist skill active; do not carry every Liferay skill into the same task unless routing proves it is needed.
