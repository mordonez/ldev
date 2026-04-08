---
title: First Incident
description: Work through a realistic Liferay incident with ldev from diagnosis to verification.
---

# First Incident

Scenario: the portal starts, but `/home` is failing and users report errors after a module deployment.

The goal is not to memorize commands. The goal is to follow a repeatable flow:

`understand -> diagnose -> fix -> verify`

## 1. Start from the local environment

```bash
ldev start
ldev status
ldev doctor
```

You want the environment running before you inspect anything else. `doctor` tells you if the problem is really application-level or if the environment itself is misconfigured.

## 2. Diagnose the failure from logs

```bash
ldev logs diagnose --since 10m --json
```

Look for repeated exceptions, startup failures, missing configuration, or unresolved component errors.

If the report points to a bundle or module, keep that name. You will use it in the next step.

## 3. Check the affected page without using the UI

```bash
ldev portal inventory page --url /home --json
```

This tells you what page `ldev` can resolve at `/home`, which layout it maps to, and what is on the page. If the UI is broken, you can still inspect the route and page structure from the API.

## 4. Inspect the failing OSGi bundle

If the logs mention `com.acme.foo.web`, inspect it directly:

```bash
ldev osgi status com.acme.foo.web
ldev osgi diag com.acme.foo.web
```

Typical outcomes:

- the bundle is `Active`: the issue is probably configuration or data
- the bundle is `Resolved` or `Installed`: a dependency is missing
- `diag` shows an unsatisfied reference: fix the missing service or deploy the matching module

## 5. Apply the fix locally

If you changed one module, redeploy only that module:

```bash
ldev deploy module foo-web
```

If the bundle state is still stale after deployment, restart the runtime service:

```bash
ldev env restart
```

If the problem was configuration, update the config in your repo, then restart and re-check.

## 6. Verify before you stop

```bash
ldev portal check
ldev portal inventory page --url /home --json
ldev logs diagnose --since 5m --json
```

You are done when:

- `portal check` succeeds
- the page resolves cleanly
- the repeated exception is gone from the diagnosis output

## Why this flow matters

This is the default `ldev` operating model:

1. understand the environment
2. diagnose from structured signals
3. apply the smallest safe fix locally
4. verify with the same commands

That is how you move from production symptoms to local confidence.
