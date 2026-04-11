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

Use deploy commands only for deployable artifacts:

- `ldev deploy theme` only when the change touches the packaged theme.
- `ldev deploy module <module-name>` only when the change touches a module or
  another deployable Gradle unit.
- Do not use a broad deploy unless a human explicitly asks for a full local
  artifact refresh and the narrower options have been ruled out.
- Do not use deploy commands for Journal templates, ADTs, fragments, or
  structures. Those live in the portal runtime and must be applied with
  `ldev resource import-*`.

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

Use only after a confirmed Service Builder change to `service.xml` or the
generated service layer. If a single generated module can prove the change, use
`ldev deploy module <module-name>` instead.

### Full local artifact refresh

Avoid this by default. Do not run broad artifact refresh commands from the
skill. Stop and ask for explicit human approval when the change cannot be
proved with `ldev deploy module <module-name>` or `ldev deploy theme`.

## Resource deployment

For file-based portal resources, use the runtime resource import flow. A Gradle
or theme deploy will not apply Journal templates, ADTs, fragments, or
structures.

Validate before mutating:

```bash
ldev resource import-structure --site /<site> --key <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --id <TEMPLATE_ID> --check-only
ldev resource import-adt --site /<site> --file <path/to/adt.ftl> --check-only
ldev resource import-fragment --site /<site> --fragment <fragment-key>
```

> `import-fragment` has no `--check-only` flag. Validate fragment source files
> manually before running this command.

If the preview is correct, re-run without `--check-only`:

```bash
ldev resource import-structure --site /<site> --key <STRUCTURE_KEY>
ldev resource import-template --site /<site> --id <TEMPLATE_ID>
ldev resource import-adt --site /<site> --file <path/to/adt.ftl>
```

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

Then use `playwright-cli` for the affected page or flow so the runtime result
is validated in a browser, not only through CLI output.

Minimum done criteria:

- the smallest intended deploy or import completed successfully
- the affected bundle is `ACTIVE` when applicable
- `ldev portal check --json` succeeds when the fix affects portal behavior
- fresh diagnosis output does not show the original error pattern
- the original page or resource resolves through `ldev portal inventory ...` when applicable
- browser-visible changes are validated with `playwright-cli`, not just CLI output

## Guardrails

- Do not use a wider deploy than necessary.
- Do not use `ldev deploy theme` unless the theme changed.
- Do not use `ldev deploy module` unless a module or deployable Gradle unit changed.
- Do not use plural resource commands or a broad deploy unless a human
  explicitly asks for a bulk operation and the risk is written down first.
- Do not assume success from build output alone; verify runtime state.
- Do not mark portal resource work done until the runtime import and browser
  verification have passed in the prepared environment.
- Prefer `--json` on verification commands when the result will be consumed by an agent.
- If the env is unhealthy, stop here and switch to `troubleshooting-liferay`.

Reference:
- `references/worktree-pitfalls.md`
