---
name: ldev-osgi-debug
description: 'Diagnoses OSGi bundle failures, missing services, hanging threads, and memory issues in a local Liferay runtime. Use when a module is not deploying, a bundle is in INSTALLED/RESOLVED state instead of ACTIVE, or the portal is hanging or running out of memory.'
---

# OSGi Debug

Diagnoses OSGi runtime issues for deployed modules and system bundles.

## Bootstrap

```bash
ldev ai bootstrap --intent=troubleshoot --json
```

Inspect: `doctor.readiness.runtime`, `context.commands.osgi`.

If the runtime is not ready (`ldev status --json` shows stopped containers), start first:
```bash
ldev start
```

## Check Bundle State

```bash
ldev osgi status <bundle-symbolic-name> --json
```

Expected result: `state: ACTIVE`. Any other state means the bundle has a problem.

If you don't know the exact bundle name, search logs first:
```bash
ldev logs diagnose --since 5m --json
```

The `issues[]` array in the diagnose output typically names the failing bundle.

## Diagnose Bundle Issues

```bash
ldev osgi diag <bundle-symbolic-name> --json
```

Returns the full OSGi diagnostic: missing required services, unresolved packages,
and dependency chain failures. Read the `requirements` section to identify what is unsatisfied.

**Common patterns:**
- `Unresolved requirement` on a package → the providing bundle is missing or at wrong version
- `Service unavailable` → a required Declarative Service is not registered (check the service's own bundle state)
- `Error starting bundle` → check logs with `ldev logs diagnose --since 2m --json`

## Collect Thread Dump (Hanging Portal)

When the portal is unresponsive or a request hangs indefinitely:

```bash
ldev osgi thread-dump
```

Collects 3 JVM thread snapshots (configurable with `--count`). Prints to stdout.
Look for threads stuck in `WAITING` or `BLOCKED` state with a Liferay or custom module frame.

## Collect Heap Dump (Memory Issues / OOM)

When the portal is failing with OutOfMemoryError:

```bash
ldev osgi heap-dump
```

Triggers a JVM heap dump. The file path is printed after completion.
Use a heap analyzer (Eclipse MAT, JVM Explorer) to analyze the dump.

## Common Failure → Fix Mapping

| Symptom | Command | Next step |
|---|---|---|
| Bundle in `INSTALLED` | `ldev osgi diag <bundle>` | Find missing package provider |
| Bundle in `RESOLVED` | `ldev osgi diag <bundle>` | Find missing DS service |
| Portal hangs, no response | `ldev osgi thread-dump` | Look for `BLOCKED` threads |
| Portal OOM errors in logs | `ldev osgi heap-dump` | Analyze heap for large collections |
| Deploy succeeds but bundle fails | `ldev logs diagnose --since 2m --json` | Check errors after hot deploy |

## Done When

`ldev osgi status <bundle> --json` returns `state: ACTIVE` and `ldev logs diagnose --since 2m --json` shows no new errors matching the bundle name.

## Guardrails

- Always check `ldev logs diagnose` first before running `diag` — logs often name the root cause directly.
- Do not run `heap-dump` during normal operations; it pauses the JVM.
- After fixing a missing dependency, redeploy the affected bundle with `ldev deploy module <module>`.
