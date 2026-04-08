---
title: Configuration
description: Configuration files, precedence, and secret handling for ldev environments.
---

# Configuration

`ldev` resolves configuration from these sources, highest priority first:

1. shell environment variables
2. `docker/.env`
3. `.liferay-cli.yml`

## Main files

### `docker/.env`

Local runtime values such as:

- `LIFERAY_HTTP_PORT`
- `COMPOSE_PROJECT_NAME`
- `ENV_DATA_ROOT`
- `LCP_PROJECT`
- `LCP_ENVIRONMENT`

### `.liferay-cli.yml`

Version-controlled project defaults such as resource paths.

Keep secrets out of this file.

### `.liferay-cli.local.yml`

Local credentials written by:

```bash
ldev oauth install --write-env
```

Do not commit it.

## Useful environment variables

```bash
export LDEV_ACTIVATION_KEY_FILE=/path/to/activation-key.xml
export REPO_ROOT=/path/to/project
```

## Secret handling

Keep OAuth credentials and other secrets in local env files or your shell environment. Do not store them in committed project config.
