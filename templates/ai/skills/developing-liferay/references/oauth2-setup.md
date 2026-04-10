# OAuth2 Setup

Use this reference when setting up OAuth2 for headless API access, when
`ldev oauth install --write-env` is part of the workflow, or when token-related
failures block an agent or script.

## Portal-side setup

OAuth2 applications are managed in the portal UI:

**Control Panel → Security → OAuth 2 Administration → Add**

Minimum required fields:

| Field | Value |
|---|---|
| Application Name | Any descriptive name (e.g. `ldev-agent`) |
| Client Authentication Method | `client_secret_post` |
| Allowed Authorization Types | `Client Credentials` for agents and scripts; `Authorization Code` for user-delegated flows |
| Trusted Application | Enable to skip the consent screen for internal tooling |

After saving, the portal generates a **Client ID** and **Client Secret**.
Copy both — the secret is only shown once.

### Required scopes

Scopes control which headless namespaces the token can access. Add scopes on
the **Scopes** tab of the OAuth2 application.

| Scope | Required for |
|---|---|
| `Liferay.Headless.Delivery.everything` | Reading and writing Journal Articles, structured contents, pages |
| `Liferay.Headless.Admin.User.everything` | Managing users, roles, site memberships |
| `Liferay.Headless.Admin.Content.everything` | Content administration workflows |
| `Liferay.Object.Admin.everything` | Creating and managing Object definitions |
| `Liferay.Headless.Batch.Engine.everything` | Batch import/export of Object entries and other entities |

For read-only use cases, replace `everything` with `everything.read`.

## Grant types

| Grant | When to use |
|---|---|
| **Client Credentials** | Machine-to-machine: agents, scripts, CI pipelines. No user interaction required. Grants access as the portal's service account. |
| **Authorization Code** | User-delegated: the token inherits the authenticated user's permissions. Required when the operation must run as a specific user (e.g. to respect content permissions). |

For ldev workflows, `Client Credentials` is the default. Use `Authorization Code`
only when the operation explicitly requires user-level permissions.

## `ldev oauth install --write-env`

This command installs the OAuth2 client credentials into the local runtime and
writes environment variables that other `ldev` commands and headless API calls
use automatically.

```bash
ldev oauth install --write-env
```

What it writes (variables available after the command completes):

| Variable | Contains |
|---|---|
| `LIFERAY_CLI_OAUTH2_CLIENT_ID` | The read-write Client ID of the registered OAuth2 application |
| `LIFERAY_CLI_OAUTH2_CLIENT_SECRET` | The read-write Client Secret |
| `LIFERAY_CLI_OAUTH2_READONLY_CLIENT_ID` | Optional read-only Client ID when a read-only app is provisioned |
| `LIFERAY_CLI_OAUTH2_READONLY_CLIENT_SECRET` | Optional read-only Client Secret |

After running this command, `ldev context --json` should return
`liferay.oauth2Configured: true`. Verify before proceeding with agent workflows
that depend on OAuth.

## Obtaining a token manually

For debugging or one-off scripts:

```bash
curl -s -X POST \
  "$(ldev context --json | jq -r '.env.portalUrl')/o/oauth2/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>" \
  | jq -r '.access_token'
```

Use the token as a Bearer header:

```bash
curl -s \
  -H "Authorization: Bearer <token>" \
  "$(ldev context --json | jq -r '.env.portalUrl')/o/headless-delivery/v2.0/sites"
```

## When the token expires

OAuth2 Client Credentials tokens have a limited lifetime (default: 600 seconds
in Liferay). When a token expires:

- API calls return `401 Unauthorized`
- Re-request a new token using the same client credentials — do not cache tokens
  across agent sessions
- If the token lifetime is too short for a long-running workflow, increase it in
  the OAuth2 application: **Token Introspection** → **Access Token Duration**

## Common failure causes

| Symptom | Likely cause |
|---|---|
| `ldev context --json` shows `liferay.oauth2Configured: false` after install | `ldev oauth install --write-env` was not run, or the local profile/env values are still missing |
| `401 Unauthorized` on API call | Token expired or wrong scopes — verify scopes cover the endpoint being called |
| `403 Forbidden` on API call | Token is valid but the OAuth2 application lacks the required scope, or the service account lacks the portal role |
| `invalid_client` on token request | Client ID or Secret is wrong — re-check against the portal OAuth2 application |
| OAuth2 application not found | The portal was reset or the application was deleted — re-create and re-run `ldev oauth install --write-env` |
