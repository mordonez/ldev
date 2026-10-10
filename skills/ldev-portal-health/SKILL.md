---
name: ldev-portal-health
description: 'Verifies that the local Liferay portal is accessible, authenticated, and its API surface is ready. Use when checking portal connectivity, confirming OAuth works, or getting a quick health snapshot before starting work.'
---

# Portal Health

Quick health verification for the local portal. Use this before `liferay-discovery` when you only need to confirm the portal is up and auth is working — not when you need to resolve a site or structure.

## Bootstrap

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
```

Inspect: `context.liferay.portalUrl`, `context.liferay.auth.oauth2.clientId.status`.

## Auth + Connectivity Check

```bash
ldev portal check --json
```

Returns: `{"status":"ok","portalUrl":"...","user":"..."}` on success.

On failure: run `ldev doctor --portal --json` to diagnose. Common causes in [references below](#common-failures).

## Quick Health Snapshot

```bash
ldev portal audit --json
```

Returns in a single command:
- OAuth token validity
- Portal health (HTTP status)
- Site count
- Structure and template counts per site

Use this when you want a single-shot overview before a larger task.

## API Surface Verification

```bash
ldev portal inventory preflight --json
```

Probes `adminSite`, `adminUser`, and `jsonws` APIs in parallel. Result is cached for 5 minutes. Use when portal commands return unexpected 403s.

## Done When

`ldev portal check --json` returns `"status":"ok"` with a non-empty `user` field.

## Common Failures

| Symptom | Command | Fix |
|---|---|---|
| `status` != `"ok"` | `ldev portal check` | Run `ldev start`, wait for readiness |
| 401 on any portal command | `ldev portal check` | Re-run `ldev oauth install --write-env` |
| `adminUser` probe fails | `ldev portal inventory preflight` | OAuth credentials scope may be missing |
| Portal never becomes healthy | `ldev doctor --portal` | Check `ldev logs diagnose --since 10m --json` |

## Guardrails

- Do not run resource commands if `ldev portal check` fails.
- Always use `--json`; never parse human-readable health output.
