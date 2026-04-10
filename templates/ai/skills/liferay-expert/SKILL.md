---
name: liferay-expert
description: "Use when the task is technical Liferay work and it is not yet clear whether the next step is implementation, deployment or troubleshooting."
---

# Liferay Expert

This skill is the domain router for reusable `ldev` Liferay workflows.

It does not contain deep playbooks of its own. Its job is to choose the right
specialist skill quickly.

## Start here

Run this bootstrap first:

```bash
ldev context --json
```

> `ldev context --json` returns `commands.*` (which namespaces are ready),
> `liferay.oauth2Configured` (auth state), `env.portalUrl` and `paths.*`
> (local resource dirs). Use these fields to decide routing before running
> deeper commands.

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
- If the change is known and you need to edit source or portal resources:
  - use `developing-liferay`
  - useful references there:
    - `../developing-liferay/references/theme.md`
    - `../developing-liferay/references/structures.md`
    - `../developing-liferay/references/fragments.md`
    - `../developing-liferay/references/osgi.md`
    - `../developing-liferay/references/extending-liferay.md`
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

### Display Page Templates

`ldev` does not expose dedicated Display Page Template commands yet.
Verify MCP availability and use it for inspection:

```bash
ldev mcp check --json
```

If MCP is available, use OpenAPI discovery to find the relevant endpoint.
Without MCP, `ldev portal inventory page --url <url> --json` can still confirm
whether the URL resolves as a display page (`pageType: displayPage`) and which
article/structure it serves, but it does not expose dedicated Display Page
Template metadata yet.

### Navigation Menus

`ldev` does not expose dedicated Navigation Menu commands yet.
Use `ldev mcp check --json` to verify MCP availability and route through
the headless delivery API (`/o/headless-delivery/v2.0/navigation-menus`).

### Multi-site resource origin

Structures and templates are not always owned by the site visible in the
browser URL. Shared or global structures live in `/global` or a shared site.

Always verify the owning site before editing or importing:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory structures --site /global --json
ldev portal inventory structures --site /<site> --json
```

Do not assume the browser URL site is the source of truth. Export from the
site that actually owns the object.

See also: `developing-liferay/references/structures.md` for the full
export/import workflow.

### Content volume per site

When investigating large datasets after a production import:

```bash
ldev portal inventory sites --with-content --sort-by content
ldev portal inventory sites --site /<site> --with-structures --limit 20
```

If volume is too high for local work, route to `troubleshooting-liferay`
for the post-import content prune workflow.

## Shared guardrails

- Use `ldev` as the official interface.
- Prefer `ldev context --json`, `ldev doctor --json` and `ldev status --json` for automation and agents.
- Prefer the smallest deploy or import that proves the change.
- Do not invent portal mutations if an `ldev resource ...` workflow already exists.
- For site-level objects without dedicated `ldev` commands, verify MCP with
  `ldev mcp check --json` before assembling low-level API calls manually.
- Keep deep guidance in the specialist skill references; do not duplicate it here.
