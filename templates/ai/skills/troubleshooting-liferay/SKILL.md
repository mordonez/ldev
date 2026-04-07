---
name: troubleshooting-liferay
description: "Use when the local Liferay runtime is failing, unhealthy or behaving incorrectly and the cause is not yet clear."
---

# Troubleshooting Liferay

Use this skill for diagnosis first, not for speculative fixes.

## Required bootstrap

```bash
ldev doctor --json
ldev context --json
ldev status --json
```

> `ldev context --json` returns `commands.*` to identify which namespaces are
> ready and `liferay.oauth2Configured` to distinguish network vs. auth failures.

If the env is not running, start it before deeper analysis:

```bash
ldev start
```

## Core diagnosis flow

### Runtime health and logs

```bash
ldev status --json
ldev logs --since 10m --service liferay --no-follow
```

### Bundle and OSGi issues

```bash
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
```

For a hanging or slow portal, collect a thread dump:

```bash
ldev osgi thread-dump
```

### Portal discovery issues

If a page, site, structure or template is involved, resolve it from the portal:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
```

### Reindex issues

References:
- `references/reindex-after-import.md`
- `references/reindex-journal.md`

```bash
ldev portal reindex status --json
ldev portal reindex tasks --json
ldev portal reindex watch --json
```

Enable temporary speedup only while an actual reindex is active:

```bash
ldev portal reindex speedup-on
ldev portal reindex speedup-off
```

## Recovery actions

Use these only when diagnosis points to broken local runtime state:

Reference:
- `references/ddm-migration.md`

```bash
ldev stop
ldev env restore
ldev start
```

If the issue is isolated to a worktree env, inspect it explicitly:

```bash
ldev worktree env --json
```

## Guardrails

- Do not jump straight to rebuild or clean unless logs and status suggest local state corruption.
- Do not assume a portal API problem when the env is simply down; `ldev status --json` is the first check.
- Do not parse human text if a stable JSON variant exists.
- After finding the root cause, switch to `developing-liferay` or `deploying-liferay` for the actual fix path.
