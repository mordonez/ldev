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
- `POSTGRES_DATA_MODE`
- `LIFERAY_DATA_MODE`
- `LIFERAY_OSGI_STATE_MODE`
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

## Remote execution with connection overrides

When you run `ldev` from automation hosts, CI jobs, or jumpboxes, you can override Liferay connection values per command instead of changing project files.

Supported global options:

- `--liferay-url <url>`
- `--liferay-client-id <clientId>`
- `--liferay-client-secret <clientSecret>`
- `--liferay-client-secret-env <envVar>`
- `--liferay-scope-aliases <aliases>`
- `--liferay-timeout-seconds <seconds>`

Important: these are root options. Place them before the command group/subcommand.

```bash
ldev --liferay-url https://portal.example.com portal check --json
ldev --liferay-url https://portal.example.com portal inventory sites --json
```

For secrets, prefer environment-variable indirection:

```bash
export LIFERAY_REMOTE_SECRET='***'
ldev \
	--liferay-url https://portal.example.com \
	--liferay-client-id remote-client \
	--liferay-client-secret-env LIFERAY_REMOTE_SECRET \
	portal inventory page --url /home --json
```

If both `--liferay-client-secret` and `--liferay-client-secret-env` are provided, `--liferay-client-secret` wins.

If your environment cannot run `ldev oauth install --write-env`, see the manual app setup guide in [OAuth](/core-concepts/oauth#manual-setup-for-remote-environments-no-ldev-oauth-install).

## Runtime Storage Modes

`ldev` supports three persistence modes for selected runtime directories:

- `auto`: use the platform default
- `bind`: always use bind mounts under `ENV_DATA_ROOT`
- `volume`: always use Docker volumes

Supported storages:

- `POSTGRES_DATA_MODE`
- `LIFERAY_DATA_MODE`
- `LIFERAY_OSGI_STATE_MODE`
- `ELASTICSEARCH_DATA_MODE`

Default behavior:

- Windows: `auto` resolves to Docker volumes for PostgreSQL, Liferay runtime state, and Elasticsearch data
- Linux/macOS: `auto` resolves to bind mounts for these storages

This means Linux/macOS keep the classic filesystem-based workflow by default, but you can opt into Docker volumes explicitly if you prefer that tradeoff.

Example:

```env
POSTGRES_DATA_MODE=volume
LIFERAY_DATA_MODE=volume
LIFERAY_OSGI_STATE_MODE=volume
ELASTICSEARCH_DATA_MODE=volume
```

Use `bind` when you want direct host visibility under `ENV_DATA_ROOT`. Use `volume` when you want Docker-managed persistence and, on some hosts, faster I/O.

`liferay-deploy-cache` is always kept as a bind mount under `ENV_DATA_ROOT/liferay-deploy-cache`. It is a host/container exchange area for auto-deploy artifacts, so `ldev` does not support Docker volumes there.

## Platform Guide

Recommended starting point:

- Windows: keep `auto` for PostgreSQL, Liferay runtime state, deploy cache, and Elasticsearch data
- Linux/macOS: keep `auto` if you prefer the classic bind-mount workflow under `ENV_DATA_ROOT`
- Linux/macOS: switch selected storages to `volume` if you want Docker-managed persistence or better I/O on your host

Typical setups:

```env
# Default cross-platform setup
POSTGRES_DATA_MODE=auto
LIFERAY_DATA_MODE=auto
LIFERAY_OSGI_STATE_MODE=auto
ELASTICSEARCH_DATA_MODE=auto
```

```env
# Opt into Docker volumes everywhere
POSTGRES_DATA_MODE=volume
LIFERAY_DATA_MODE=volume
LIFERAY_OSGI_STATE_MODE=volume
ELASTICSEARCH_DATA_MODE=volume
```

```env
# Force the classic host-visible layout everywhere
POSTGRES_DATA_MODE=bind
LIFERAY_DATA_MODE=bind
LIFERAY_OSGI_STATE_MODE=bind
ELASTICSEARCH_DATA_MODE=bind
```

For existing projects, make sure the corresponding Compose overrides are present in `docker/` when you use `volume` or `auto` on Windows:

- `docker-compose.postgres.volume.yml`
- `docker-compose.liferay.volume.yml`
- `docker-compose.elasticsearch.volume.yml`

## Secret handling

Keep OAuth credentials and other secrets in `.liferay-cli.local.yml` or your shell environment. Do not store them in committed project config.

See [OAuth](/core-concepts/oauth) for the user-facing OAuth model.
