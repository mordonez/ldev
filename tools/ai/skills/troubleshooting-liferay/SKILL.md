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

### Portal discovery issues

If a page, site, structure or template is involved, resolve it from the portal:

```bash
ldev liferay inventory page --url <fullUrl> --json
ldev liferay inventory structures --site /<site> --json
ldev liferay inventory templates --site /<site> --json
```

### Reindex issues

```bash
ldev liferay reindex status --json
ldev liferay reindex tasks --json
ldev liferay reindex watch --json
```

Enable temporary speedup only while an actual reindex is active:

```bash
ldev liferay reindex speedup-on
ldev liferay reindex speedup-off
```

## Recovery actions

Use these only when diagnosis points to broken local runtime state:

```bash
ldev env stop
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
