---
name: deploying-liferay
description: "Use when the code or resource change already exists and the task is to build, deploy and verify it in a local ldev runtime."
---

# Deploying Liferay

Use this skill when implementation is already done and the focus is runtime
verification.

## Required bootstrap

1. `ldev context --json`
2. `ldev status --json`
3. If the env is not running: `ldev start`

## Smallest deploy first

Choose the smallest command that matches the change.

### One module

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev logs --since 2m --service liferay --no-follow
```

### Theme

```bash
ldev deploy theme
ldev logs --since 2m --service liferay --no-follow
```

### Full local artifact refresh

```bash
ldev deploy prepare
ldev deploy all
```

Use this only when the change cannot be proved with a smaller deploy.

## Resource deployment

For file-based portal resources, validate before mutating:

```bash
ldev liferay resource import-structures --site /<site> --check-only
ldev liferay resource import-templates --site /<site> --check-only
ldev liferay resource import-adts --site /<site> --check-only
ldev liferay resource import-fragments --site /<site> --check-only
```

If the preview is correct, re-run the specific import without `--check-only`.

For Journal migrations, prefer the dedicated pipeline:

```bash
ldev liferay resource migration-pipeline --migration-file <file> --check-only
ldev liferay resource migration-pipeline --migration-file <file>
```

## Runtime verification

Use OSGi diagnostics after any module deploy:

```bash
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
```

Use logs after any deploy or import:

```bash
ldev logs --since 2m --service liferay --no-follow
```

## Guardrails

- Do not use a wider deploy than necessary.
- Do not assume success from build output alone; verify runtime state.
- Prefer `--json` on verification commands when the result will be consumed by an agent.
- If the env is unhealthy, stop here and switch to `troubleshooting-liferay`.
