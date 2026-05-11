---
name: liferay-expert
description: 'Routes technical Liferay work to the right ldev specialist workflow. Use when the task involves Liferay and it is not yet clear whether the next step is diagnosis, implementation, deployment, resource import, or migration.'
---

# Liferay Expert

This is the domain router for reusable `ldev` Liferay workflows. It should
classify quickly and then hand off; deep playbooks live in specialist skills.

## Bootstrap

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
```

Use `bootstrap.context` to route:

- `context.commands.*` for supported command namespaces.
- `context.liferay.portalUrl` for the effective local portal URL.
- `context.liferay.auth.oauth2.*.status` for configured credentials.
- `context.paths.resources.*` for local resource directories.

If required fields are missing, stop and report that the installed `ldev` AI
assets are out of sync with the CLI.

## Resolve Runtime Context

If the task mentions a site, page, URL, structure, template, ADT, or fragment,
resolve it with the portal discovery contract in
[../../docs/PORTAL_DISCOVERY.md](../../docs/PORTAL_DISCOVERY.md) before
searching or editing.

## Routing

- Issue/feature work with mutation risk -> `runtime-change-workflow`
- Unknown failure or unhealthy runtime -> `troubleshooting-liferay`
- Known code/theme/module/config implementation -> `developing-liferay`
- Journal structures, Journal templates, ADTs, or fragments -> `portal-resource-workflow`
- Existing change needing build, deploy, import, or runtime proof -> `deploying-liferay`
- Journal structure change with data movement or compatibility risk -> `migrating-journal-structures`
- Browser reproduction or visual proof -> `automating-browser-tests`

For deeper routing examples, read `references/routing.md`. For Display Page
Templates, Navigation Menus, multi-site ownership, and content volume checks,
read `references/site-objects.md`.

## Command Boundaries

```bash
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
ldev portal inventory where-used --type <fragment|widget|structure|template|adt> --key <KEY> --site /<site> --json
```

- `ldev context --json`: offline repo/config facts.
- `ldev status --json`: Docker/runtime state.
- `ldev doctor --json`: active checks and readiness; add `--runtime`,
  `--portal`, or `--osgi` when that surface matters.

Do not substitute these commands for each other in plans or handoffs.

```bash
ldev portal inventory structures --with-templates --all-sites --json
```

The default page output is sufficient for routing. Add `--full` when the task
requires content fields, all template candidates, or the raw page definition:

```bash
ldev portal inventory page --url <fullUrl> --json --full
```

If the task starts from a Structure, Template, ADT, widget, or Fragment key and
the question is about impact, prefer `ldev portal inventory where-used` over
manual portal browsing or ad hoc API assembly.

Prefer the scoped form with `--site` unless the task explicitly requires a
cross-site answer.

MCP equivalents when visible:

- `liferay_inventory_page`
- `liferay_inventory_structures`
- `liferay_inventory_templates`

## Routing rules

Choose the next specialist skill using `references/routing.md`:

- unclear cause -> `troubleshooting-liferay`
- known implementation change -> `developing-liferay`
- existing change that needs deploy or verification -> `deploying-liferay`
- Journal migration risk -> `migrating-journal-structures`

## Site-level objects

When the task involves site configuration or site-level objects beyond
structures, templates, and fragments, resolve the affected site first:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --json
```

For deeper routing notes and specialist reference entrypoints, read
`references/routing.md`. For details on Display Page Templates, Navigation
Menus, multi-site resource ownership, and content volume inspection, see
`references/site-objects.md`.

## Discovery commands

Three commands are often confused — use the right one for each situation:

- `ldev context --json` — offline project facts (repo config, auth state, resource
  paths, version). No runtime required. Use for routing decisions and bootstrap.
- `ldev status --json` — Docker/runtime state (containers running, ports). Use to
  confirm the env is up before portal or deploy operations.
- `ldev doctor --json` — active failures and readiness checks. Cheap by default
  (repo/config/tool presence only). Add scope flags when runtime checks matter:
  `--runtime`, `--portal`, `--osgi`.

## AI asset maintenance

When skills or agent context files are out of date:

```bash
# Check installed skill state and drift
ldev ai status --target <project-root> --json

# Update vendor skills to the latest published versions
ldev ai update --target <project-root>

# Update only a specific skill
ldev ai update --target <project-root> --skill <skill-name>
```

Run `ldev ai status` first to understand what is installed before updating.

## OAuth2 prerequisite

Most portal and resource commands require OAuth2 credentials. If
`context.liferay.auth.oauth2.clientId.status` is not `"present"`, set up
credentials first:

```bash
ldev start
ldev oauth install --write-env
```

`--write-env` persists the credentials to `.liferay-cli.local.yml` so all
subsequent commands and agents can use them without re-running the installer.
If the admin account is in password-reset state, unblock it first:

```bash
ldev oauth admin-unblock
```

## Shared guardrails

- Use `ldev` as the official interface.
- Prefer local `ldev` MCP tools for read-only discovery when visible; fall back
  to CLI with `--json`.
- Do not invent portal mutations when an `ldev resource ...` workflow exists.
- Keep the smallest specialist skill active; do not carry every Liferay skill
  into the same task unless routing proves it is needed.
