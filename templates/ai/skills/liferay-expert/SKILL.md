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

If the task involves a portal URL or resource, resolve that context first:

```bash
ldev liferay inventory page --url <fullUrl> --json
ldev liferay inventory structures --site /<site> --json
ldev liferay inventory templates --site /<site> --json
```

## Routing rules

- If the cause is not clear yet:
  - use `troubleshooting-liferay`
- If the change is known and you need to edit source or portal resources:
  - use `developing-liferay`
- If the change already exists and you need to build, deploy or verify runtime:
  - use `deploying-liferay`
- If the task changes Journal structures with data migration risk:
  - use `migrating-journal-structures`

## Shared guardrails

- Use `ldev` as the official interface.
- Prefer `ldev context --json`, `ldev doctor --json` and `ldev status --json` for automation and agents.
- Prefer the smallest deploy or import that proves the change.
- Do not invent portal mutations if an `ldev liferay resource ...` workflow already exists.
