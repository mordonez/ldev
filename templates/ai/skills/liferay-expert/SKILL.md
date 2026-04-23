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
ldev ai bootstrap --intent=discover --json
```

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

## Routing rules

- If the cause is not clear yet:
  - use `troubleshooting-liferay`
  - useful references there:
    - `../troubleshooting-liferay/references/reindex-after-import.md`
    - `../troubleshooting-liferay/references/reindex-journal.md`
    - `../troubleshooting-liferay/references/ddm-migration.md`
    - `../troubleshooting-liferay/references/search-debug.md` — for buscador / search widget failures
    - `../troubleshooting-liferay/references/content-versions.md` — for version accumulation or empty language versions
- If the change is known and you need to edit source or portal resources:
  - use `developing-liferay`
  - useful references there:
    - `../developing-liferay/references/theme.md`
    - `../developing-liferay/references/structures.md`
    - `../developing-liferay/references/fragments.md`
    - `../developing-liferay/references/osgi.md`
    - `../developing-liferay/references/extending-liferay.md`
    - `../developing-liferay/references/groovy-console.md` — for portal console scripts, ERC vocabulary fixes
    - `../developing-liferay/references/workflow.md` — for publish failures and workflow approval issues
- If the change already exists and you need to build, deploy or verify runtime:
  - use `deploying-liferay`
  - useful reference there:
    - `../deploying-liferay/references/worktree-pitfalls.md`
- If the task changes Journal structures with data migration risk:
  - use `migrating-journal-structures`

## Site-level objects

When the task involves site configuration or site-level objects beyond
structures, templates, and fragments, resolve the affected site first:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --json
```

For details on Display Page Templates, Navigation Menus, multi-site resource
ownership, and content volume inspection, see
`references/site-objects.md`.

## Shared guardrails

- Use `ldev` as the official interface.
- Prefer `ldev context --json`, `ldev doctor --json` and `ldev status --json` for automation and agents.
- Prefer the smallest deploy or import that proves the change.
- Do not invent portal mutations if an `ldev resource ...` workflow already exists.
- For site-level objects without dedicated `ldev` commands, verify MCP with
  `ldev mcp check --json` before assembling low-level API calls manually.
- Keep deep guidance in the specialist skill references; do not duplicate it here.
