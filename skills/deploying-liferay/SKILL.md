---
name: deploying-liferay
description: 'Builds, deploys, imports, and verifies existing Liferay changes in a local ldev runtime. Use when implementation already exists and the task is proving it in runtime.'
---

# Deploying Liferay

> **Prerequisite:** [`ldev-shared`](../ldev-shared/SKILL.md)

Use this skill when the change already exists and the focus is runtime proof.
For issue-scale work, `runtime-change-workflow` owns the Red -> Green contract.

## Bootstrap

```bash
ldev ai bootstrap --intent=deploy --json
```

Inspect: `context.liferay.portalUrl`, `context.commands.deploy`, `context.paths.resources.*`, `doctor.readiness.deploy`. If deploy readiness is blocked, resolve the listed checks first.

## Smallest Runtime Action

- Module or deployable Gradle unit:

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
```

`<module-name>` may be the leaf directory, a `modules/...` relative path, or
the bundle symbolic name from `bnd.bnd`. If `MODULE_NOT_FOUND` appears, inspect
the command hints and retry with the relative module path before widening to
`ldev deploy all`.

- Theme:

```bash
ldev deploy theme --format json
ldev logs diagnose --since 5m --json
```

Use the runtime proof contract in
[references/theme-deploy-runtime-proof.md](references/theme-deploy-runtime-proof.md).

- Journal structures, Journal templates, ADTs, or fragments:

```text
Use portal-resource-workflow.
```

- Journal migration: use `migrating-journal-structures`.

Use `ldev deploy prepare` only to stage artifacts before a deploy. It is not a
substitute for deploying or importing into the running portal.

## Runtime Verification

After the smallest action, collect evidence matched to the changed surface:

- modules: `ldev osgi status`, `ldev osgi diag`, and fresh logs
- theme: browser-visible page check and fresh logs
- portal resources: `portal-resource-workflow` read-back and browser proof
- portal availability: `ldev portal check --json`
- regressions: `ldev logs diagnose --since 5m --json`

For browser-visible changes, validate the affected local URL with
`automating-browser-tests` or the available Playwright flow.

## Done When

- Deployed artifact is verified with the matching runtime evidence (OSGi status, logs, browser, or resource read-back).
- `ldev logs diagnose --since 5m --json` shows no new ERRORs introduced by the deploy.
- Portal is reachable: `ldev portal check --json` is clean.

## Guardrails

- Do not use a wider deploy than necessary.
- Deploy commands do not apply structures, templates, ADTs, or fragments — use `portal-resource-workflow`.
- Treat `ldev deploy all` JSON as runtime evidence only when `hotDeployed` is
  true or `hotDeployReason` explains why a restart/manual action remains.
- For theme deploys, use the contract in
  [references/theme-deploy-runtime-proof.md](references/theme-deploy-runtime-proof.md).
- Do not assume success from build output alone.
- Do not mark portal resource work done until import, read-back, and browser
  validation have passed.
- Prefer `--json` on verification commands.
- If the env is unhealthy, stop and switch to `troubleshooting-liferay`.

## See Also

- [`recipe-deploy-and-verify`](../recipe-deploy-and-verify/SKILL.md) — concise step-by-step for the module deploy + OSGi verify loop
- [`portal-resource-workflow`](../portal-resource-workflow/SKILL.md) — for structures, templates, ADTs, and fragments (not deploy commands)
- [`troubleshooting-liferay`](../troubleshooting-liferay/SKILL.md) — if the env is unhealthy before or after deploy
