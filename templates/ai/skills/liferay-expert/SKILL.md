---
name: liferay-expert
description: 'Use when the task is technical Liferay work and it is not yet clear whether the next step is implementation, deployment or troubleshooting.'
---

# Liferay Expert

This skill is the domain router for reusable `ldev` Liferay workflows.

It does not contain deep playbooks of its own. Its job is to choose the right
specialist skill quickly.

## Start here

Run this bootstrap first:

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
```

Use `--cache=60` for read-only discovery. If the task depends on fresh runtime
or portal state, switch to the task-shaped command that probes that surface
instead of forcing a no-cache discovery bootstrap.

Use `bootstrap.context` to decide routing:

- `context.commands.*` — supported command namespaces and missing requirements.
- `context.liferay.auth.oauth2.*.status` — configured auth state.
- `context.liferay.portalUrl` — effective local portal URL.
- `context.paths.resources.*` — local resource dirs.

## Bootstrap fields

- Required fields: `context.commands.*`, `context.liferay.version`,
  `context.liferay.edition`, `context.paths.resources.*`.
- If any of those fields is missing, stop and report that the installed `ldev`
  AI assets are out of sync with the CLI.

If the site is not known, discover it:

```bash
ldev portal inventory sites --json
```

If the task involves a portal URL or resource, resolve that context first:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
```

For cross-site structure/template discovery, prefer:

```bash
ldev portal inventory structures --with-templates --all-sites --json
```

The default page output is sufficient for routing. Add `--full` when the task
requires content fields, all template candidates, or the raw page definition:

```bash
ldev portal inventory page --url <fullUrl> --json --full
```

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
- Use `ldev context --json` for offline routing; use `ldev status --json` only
  to confirm runtime state. They are not interchangeable.
- Prefer the smallest deploy or import that proves the change.
- Do not invent portal mutations if an `ldev resource ...` workflow already exists.
- For site-level objects without dedicated `ldev` commands, verify MCP with
  `ldev mcp check --json` before assembling low-level API calls manually.
- Keep deep guidance in the specialist skill references; do not duplicate it here.
