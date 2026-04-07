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

## Shared guardrails

- Use `ldev` as the official interface.
- Prefer `ldev context --json`, `ldev doctor --json` and `ldev status --json` for automation and agents.
- Prefer the smallest deploy or import that proves the change.
- Do not invent portal mutations if an `ldev resource ...` workflow already exists.
- Keep deep guidance in the specialist skill references; do not duplicate it here.
