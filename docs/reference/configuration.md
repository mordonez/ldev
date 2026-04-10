---
title: Configuration
description: Configuration files, precedence, and secret handling for ldev environments.
---

# Configuration

`ldev` resolves configuration from these sources, highest priority first:

1. shell environment variables
2. `.liferay-cli.local.yml`
3. `docker/.env` as a legacy fallback for runtime and some connection values
4. `.liferay-cli.yml`

## Main files

### `docker/.env`

Local runtime values such as:

- `LIFERAY_HTTP_PORT`
- `COMPOSE_PROJECT_NAME`
- `ENV_DATA_ROOT`
- `LCP_PROJECT`
- `LCP_ENVIRONMENT`

`ldev` may also read `LIFERAY_CLI_URL` and OAuth variables from here as a legacy fallback, but this is not the preferred destination for `ldev oauth install --write-env`.

### `.liferay-cli.yml`

Version-controlled project defaults such as resource paths and shared non-secret defaults.

Keep secrets out of this file.

### `.liferay-cli.local.yml`

Local credentials and local-only overrides written by:

```bash
ldev oauth install --write-env
```

Do not commit it.

This is the preferred file for local OAuth credentials.

## Useful environment variables

```bash
export LDEV_ACTIVATION_KEY_FILE=/path/to/activation-key.xml
export REPO_ROOT=/path/to/project
```

## Secret handling

Keep OAuth credentials and other secrets in `.liferay-cli.local.yml` or your shell environment. Do not store them in committed project config.

See [OAuth](/core-concepts/oauth) for the user-facing OAuth model.
