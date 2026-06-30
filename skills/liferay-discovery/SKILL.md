---
name: liferay-discovery
description: 'Resolves Liferay portal auth, site identity, and API surface before any portal operation. Use when starting any task that involves a site, page, structure, template, ADT, fragment, or Elasticsearch index — before running any other ldev portal or resource command.'
---

# Liferay Discovery

Foundational skill. Run this before any portal or resource operation. It resolves the three invariants every other skill needs: auth is working, the target site is identified, and the API surface is verified.

## Bootstrap

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
```

Inspect:
- `context.liferay.portalUrl` — the active portal URL; never hardcode `localhost:8080`
- `context.liferay.auth.oauth2.clientId.status` — must be `"present"` to run portal commands
- `context.commands.*` — which command namespaces are active

If `context.liferay.auth.oauth2.clientId.status` is not `"present"`, follow [references/auth.md](references/auth.md) before continuing.

## Verify Portal Is Reachable

```bash
ldev portal check --json
```

If this fails, stop. The portal is not ready. Run `ldev doctor --portal --json` to diagnose, then resolve before continuing.

## Resolve The Target Site

If the task mentions a site, page, or scoped resource, resolve the site first:

```bash
ldev portal inventory sites --json
```

From the result, extract `friendlyUrlPath` for the target site. Never guess site IDs or friendly URLs. Use the resolved `friendlyUrlPath` as `--site` for all subsequent commands.

For the full site resolution protocol including display pages and ownership edge cases, see [references/site-resolution.md](references/site-resolution.md).

## Verify API Surface

When portal commands return 403 or unexpected 404s, check which headless APIs are accessible:

```bash
ldev portal inventory preflight --json
```

This probes `adminSite`, `adminUser`, and `jsonws` in parallel and caches results for 5 minutes.

## Done When

- `ldev portal check --json` returns a success status
- Target site is identified with its exact `friendlyUrlPath`
- `portalUrl` is read from bootstrap output, not assumed

## Guardrails

- Never guess portal URL. Always read `context.liferay.portalUrl` from bootstrap.
- Never guess site IDs or friendly URLs. Always resolve via `ldev portal inventory sites`.
- If auth is missing, run `ldev oauth install --write-env` after `ldev start`.
- If the admin account is in password-reset state, unblock it first: `ldev oauth admin-unblock`.
