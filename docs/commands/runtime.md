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

Optional preparation before `ldev start`: pull images, refresh `docker/.env`
and warm local runtime directories.

```bash
ldev setup
ldev setup --skip-pull
ldev setup --with elasticsearch --with postgres
```

Use `--with <service>` (repeatable) to opt into extra Compose services such as
`elasticsearch` or `postgres` when the project scaffold omitted them. For new
projects, prefer selecting services during scaffold:
`ldev project init my-project --services postgres,elasticsearch`.

## `ldev start`

Start containers and wait for Liferay health.

```bash
ldev start
ldev start --activation-key-file /path/to/activation-key.xml
ldev start --no-wait
ldev start --timeout 400
```

Default health timeout is 250s.

`ldev start` prepares the runtime data directories before `docker compose up`,
so services that run as a non-root user (Elasticsearch 8, Liferay) never see
root-owned bind mounts.

### Activation key

Keep the DXP activation key outside the repository. `ldev start` reads its path
from, in order: `--activation-key-file`, `LDEV_ACTIVATION_KEY_FILE` in the shell,
or `LDEV_ACTIVATION_KEY_FILE` in `docker/.env`. It installs the key only into the
generated `liferay/build/docker/configs/dockerenv/osgi/modules/` (rebuilt on every
start, never versioned); the bundled trial license is removed at pre-startup.
`ldev doctor` reports whether the key exists, its license type and its expiry.

### DXP 2026 and Elasticsearch

DXP 2026.q1 and later ship only the `elasticsearch8` connector (2025.q4 and
earlier ship `elasticsearch7`). `ldev project init` and `ldev setup --with
elasticsearch` derive both sides from `LIFERAY_IMAGE`:

| `LIFERAY_IMAGE` | `ELASTICSEARCH_VERSION` | Connector config |
| --- | --- | --- |
| DXP 2025.q4 and earlier | `7.17.26` | `com.liferay.portal.search.elasticsearch7…config` with `operationMode="REMOTE"` |
| DXP 2026.q1 and later | `8.19.0` | `com.liferay.portal.search.elasticsearch8…config` with `productionModeEnabled=B"true"` |

The `elasticsearch8` connector ignores `operationMode`; without
`productionModeEnabled=B"true"` Liferay silently starts its sidecar. `ldev doctor`
fails the `search-engine` check on any mismatch and warns when the host JDK is
older than 21.

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
