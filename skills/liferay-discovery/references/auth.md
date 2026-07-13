# Auth Setup Reference

## Auth Priority Stack

ldev resolves credentials in this order (highest to lowest priority):

1. `LIFERAY_OAUTH_CLIENT_ID` + `LIFERAY_OAUTH_CLIENT_SECRET` environment variables
2. `.liferay-cli.local.yml` in the project root (created by `ldev oauth install --write-env`)
3. `.liferay-cli.yml` in the project root (committed defaults)

Read `context.liferay.auth.oauth2.clientId.status` from bootstrap output to know which tier is active.

## Setup (First Time)

```bash
ldev start
ldev oauth admin-unblock     # only if admin is in password-reset state
ldev oauth install --write-env
```

`--write-env` persists credentials to `.liferay-cli.local.yml`. This file must not be committed.

## Verify Auth

```bash
ldev portal check --json
```

A successful result confirms that:
- OAuth token was obtained
- `GET /o/headless-admin-user/v1.0/my-user-account` returned 200

## Common Failures

| Symptom | Cause | Fix |
|---|---|---|
| `oauth2.clientId.status` = `"missing"` | No credentials configured | Run `ldev oauth install --write-env` |
| `ldev portal check` returns 401 | Expired token or wrong credentials | Re-run `ldev oauth install --write-env` |
| `ldev oauth install` fails | Admin in password-reset state | Run `ldev oauth admin-unblock` first |
| `ldev start` needed | Portal not running | Run `ldev start` and wait for readiness |

## Scripting: Obtain a Raw Token

When scripts need a raw Bearer token (e.g., for direct curl calls):

```bash
ldev portal auth token --json
```

Returns `{"accessToken": "..."}`. Do not log or persist this output.
