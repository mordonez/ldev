---
name: recipe-deploy-and-verify
description: 'Deploys a single Liferay module and verifies it is active in OSGi. Use when the implementation exists and the task is proving it in the running local runtime.'
---

# Recipe: Deploy and Verify

> **Prerequisites:** [`ldev-shared`](../ldev-shared/SKILL.md), [`deploying-liferay`](../deploying-liferay/SKILL.md)

## When to Use

The module code is already written. The task is: build, deploy, confirm it is ACTIVE, and confirm no regressions in logs.

For portal resources (structures, templates, ADTs, fragments) use `recipe-resource-import-and-verify` instead.

## Steps

### 1. Confirm the env is healthy

```bash
ldev doctor --json
```

If `doctor.readiness.deploy` is false, resolve the listed checks before continuing. If the env is down:

```bash
ldev start
ldev doctor --json
```

### 2. Deploy the module

```bash
ldev deploy module <module-name> --json
```

`<module-name>` can be the leaf directory name, a `modules/...` relative path, or the bundle symbolic name from `bnd.bnd`. If `MODULE_NOT_FOUND` appears, inspect the error hints and retry with the relative path before widening.

### 3. Check OSGi state

```bash
ldev osgi status <bundle-symbolic-name> --json
```

If the bundle is not ACTIVE:

```bash
ldev osgi diag <bundle-symbolic-name> --json
```

Read the unsatisfied requirements. Resolve missing dependencies or wiring issues before proceeding.

### 4. Check logs for regressions

```bash
ldev logs diagnose --since 5m --json
```

Look for ERROR or WARN entries related to the deployed bundle or its dependencies.

## Done When

- `ldev osgi status` returns `state: "ACTIVE"` for the deployed bundle.
- `ldev logs diagnose` shows no new ERRORs introduced by the deploy.

Do not claim done from build output or deploy command success alone.
