---
title: Runtime Commands
description: Minimal reference for starting, checking, and repairing local Liferay environments.
---

# Runtime Commands

Every command accepts `--json` or `--ndjson` for structured output, plus `--strict` to return a non-zero exit code when something is wrong. See [Structured Output](/core-concepts/structured-output).

## `ldev doctor`

Diagnose environment health and command readiness. Use `ldev context` when you
need an offline project snapshot; use `ldev doctor` when you need pass/warn/fail
checks.

```bash
ldev doctor
ldev doctor --json
ldev doctor --list-checks --json
ldev doctor --readiness deploy
ldev doctor --runtime --json
ldev doctor --portal --json
ldev doctor --osgi --json
```

`doctor --json` keeps the default basic diagnostics. Extra runtime probes are
opt-in:

- `--runtime` adds Docker Compose service state into `doctor.runtime`.
- `--portal` adds HTTP and OAuth token probes into `doctor.portal`.
- `--osgi` adds Gogo connectivity and bundle summary into `doctor.osgi`.

These blocks are `null` unless explicitly requested.

## `ldev setup`

Pull images, seed `docker/.env` and warm the deploy cache before the first `ldev start`.

```bash
ldev setup
ldev setup --skip-pull
ldev setup --with elasticsearch --with postgres
```

Use `--with <service>` (repeatable) to opt into extra Compose services such as `elasticsearch` or `postgres` when the project scaffold omitted them.

## `ldev start`

Start containers and wait for Liferay health.

```bash
ldev start
ldev start --activation-key-file /path/to/activation-key.xml
ldev start --no-wait
ldev start --timeout 400
```

`--activation-key-file` copies a local DXP activation key into `liferay/configs/dockerenv/osgi/modules` before start. Default health timeout is 250s.

## `ldev stop`

Stop containers.

```bash
ldev stop
```

## `ldev status`

Show the runtime state of the current environment. Defaults to JSON output.

```bash
ldev status
ldev status --format text
```

## `ldev logs`

Stream container logs. This is a thin wrapper around `docker compose logs` and passes the stream through directly.

```bash
ldev logs
ldev logs --service liferay
ldev logs --since 10m
ldev logs --no-follow
```

## `ldev logs diagnose`

Analyze recent logs and group exceptions by type and frequency. Defaults to JSON.

```bash
ldev logs diagnose
ldev logs diagnose --since 10m
ldev logs diagnose --service liferay --since 1h --format text
```

## `ldev shell`

Open an interactive shell inside the `liferay` container.

```bash
ldev shell
```

## `ldev env restart` / `recreate`

Refresh the runtime when a simple deploy is not enough.

```bash
ldev env restart
ldev env recreate
ldev env restart --no-wait --timeout 400
```

`restart` restarts the `liferay` service; `recreate` force-recreates its containers. Both wait for health by default.

## `ldev env wait` / `is-healthy` / `diff`

Scriptable health utilities.

```bash
ldev env wait --timeout 600 --poll 10
ldev env is-healthy
ldev env diff --write-baseline
ldev env diff --baseline docker/env-baseline.json
```

`is-healthy` returns exit code `0` when healthy and `1` otherwise, for use in shell pipelines.

## `ldev env init` / `restore` / `clean`

Lifecycle maintenance for the Docker runtime.

```bash
ldev env init
ldev env restore
ldev env clean --force
```

`clean` is destructive and requires `--force`. `restore` replaces runtime data from the main repo or from `BTRFS_BASE` when available.
