---
title: OAuth
description: How OAuth fits into ldev, what `ldev oauth install --write-env` does, and where credentials are stored.
---

# OAuth

OAuth is a core part of how `ldev` talks to Liferay.

Many `ldev` commands work through Liferay APIs rather than through the UI. That includes:

- portal discovery
- portal checks
- resource export and import
- inventory and page inspection
- MCP and agent-friendly API access

That means `ldev` needs a valid OAuth2 client for the current portal.

## The normal user flow

Once the portal is up and the setup wizard is complete, install OAuth once:

```bash
ldev oauth install --write-env
```

That command creates or refreshes the managed OAuth app used by `ldev`, then writes the read-write client credentials into:

- `.liferay-cli.local.yml`

After that, commands such as these can authenticate directly against the portal APIs:

```bash
ldev portal check
ldev portal inventory sites
ldev liferay auth check
```

## Where credentials live

For OAuth credentials, the preferred local destination is:

- `.liferay-cli.local.yml`

This file is local-only and should not be committed.

`ldev` still supports `docker/.env` as a legacy fallback for some runtime values and older setups, but OAuth credentials written by `ldev oauth install --write-env` go to `.liferay-cli.local.yml`.

## Resolution order

For the portal URL and OAuth credentials, `ldev` resolves configuration in this order:

1. shell environment variables
2. `.liferay-cli.local.yml`
3. `docker/.env` as a legacy fallback
4. built-in defaults

For shared project defaults such as paths, `ldev` uses:

1. `.liferay-cli.yml`
2. `.liferay-cli.local.yml` when overriding those values locally

## Why there are two install paths

`ldev oauth install` supports two project shapes:

- `ldev-native`: deploy the bundled OAuth installer and invoke its Gogo command directly
- Liferay Workspace: deploy the same bundle and bootstrap via a temporary OSGi config

The user-facing contract is the same in both cases:

- install or refresh the managed OAuth app
- verify that the credentials work when possible
- persist local credentials for the CLI

## When OAuth is not ready yet

If the portal setup wizard is not complete, or the local portal is not reachable yet, OAuth-based commands will fail or stay pending.

Start with:

```bash
ldev doctor
ldev oauth install --write-env
ldev portal check
```

If that still fails, see [Troubleshooting](/troubleshooting#oauth-authentication).
