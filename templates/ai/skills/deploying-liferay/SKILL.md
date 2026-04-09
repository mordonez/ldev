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

> `ldev context --json` provides `env.portalUrl`, `commands.*` (which namespaces
> are ready) and `paths.*` (local resource dirs). Check `commands.deploy` and
> `commands.portal` before proceeding.

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

### Service Builder

```bash
ldev deploy service
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
ldev resource import-structures --site /<site> --apply --check-only
ldev resource import-templates --site /<site> --apply --check-only
ldev resource import-adts --site /<site> --apply --check-only
ldev resource import-fragments --site /<site>
```

> `import-fragments` has no `--check-only` flag. Validate fragment source files
> manually before running this command.

If the preview is correct, re-run the specific import without `--check-only`
(where applicable).

For Journal migrations, prefer the dedicated pipeline:

```bash
ldev resource migration-pipeline --migration-file <file> --check-only
ldev resource migration-pipeline --migration-file <file>
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

Prefer the task-shaped diagnosis summary when checking for fresh regressions:

```bash
ldev logs diagnose --since 5m --json
```

Use portal reachability checks when the fix affects page rendering, portal
availability, or resource-backed behavior:

```bash
ldev portal check --json
ldev portal inventory page --url <fullUrl> --json
```

Minimum done criteria:

- the smallest intended deploy or import completed successfully
- the affected bundle is `ACTIVE` when applicable
- `ldev portal check --json` succeeds when the fix affects portal behavior
- fresh diagnosis output does not show the original error pattern
- the original page or resource resolves through `ldev portal inventory ...` when applicable

## Guardrails

- Do not use a wider deploy than necessary.
- Do not assume success from build output alone; verify runtime state.
- Prefer `--json` on verification commands when the result will be consumed by an agent.
- If the env is unhealthy, stop here and switch to `troubleshooting-liferay`.

Reference:
- `references/worktree-pitfalls.md`
