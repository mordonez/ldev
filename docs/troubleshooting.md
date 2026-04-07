---
title: Troubleshooting
---

If you are on a platform marked experimental or unsupported, check the [Support Matrix](/support-matrix) first. Some failures are host/platform limitations, not CLI regressions.

## Triage in 60 seconds

Read only the section that matches your symptom:

- Setup or host checks fail: `ldev doctor` fails
- Portal does not get healthy: Liferay start health timeout
- API commands fail: `ldev portal check` fails
- Deploy completed but changes are missing: Deploy not reflected in the portal
- DB import/sync problems: Database issues
- Worktree issues: Worktrees

If you are unsure where to start, run `ldev doctor`, then `ldev logs diagnose`.

---

## `ldev doctor` fails

### Docker not running

```text
[FAIL] Docker Daemon: docker CLI is available but the daemon is not responding
```

Start Docker Desktop (or `sudo systemctl start docker` on Linux) and run `ldev doctor` again.

---

### Port already in use

```text
[WARN] HTTP Port: host port localhost:8080 is already in use
```

Find what is using the port and stop it, or change `LIFERAY_HTTP_PORT` in `docker/.env`:

```bash
lsof -i :8080
# then stop the process, or:
echo "LIFERAY_HTTP_PORT=8181" >> docker/.env
```

---

### Low host memory

```text
[WARN] Host Memory: host memory 4.0 GiB is below the recommended 8 GB for Docker + Liferay
```

Increase Docker Desktop memory or free RAM on the host before starting Elasticsearch and Liferay together.

---

### `docker/.env` not found

ldev did not detect a valid project (needs `docker/docker-compose.yml` + `liferay/` directory).

```bash
ldev setup      # creates docker/.env from .env.example
# or
ldev env init   # normalize docker/.env for the current repo
```

---

### Activation key path invalid or missing

```text
[FAIL] Activation Key: activation key file does not exist: /path/to/activation-key.xml
```

Set a readable `activation-key-*.xml` file before starting DXP:

```bash
export LDEV_ACTIVATION_KEY_FILE=/absolute/path/to/activation-key-dxp.xml
ldev doctor
```

---

## Liferay start health timeout

### Startup timeout

```text
✗ Timed out waiting for Liferay to become healthy
```

Increase the timeout or skip waiting and check logs manually:

```bash
ldev start --timeout 600
# or
ldev start --no-wait
ldev logs --since 5m
ldev logs diagnose
```

---

### Activation key missing or expired

Liferay DXP will start but stay in an unusable state without a valid key. Pass the key at start:

```bash
ldev start --activation-key-file /path/to/activation-key-dxp.xml
```

Or set it permanently in your shell profile:

```bash
export LDEV_ACTIVATION_KEY_FILE=/path/to/activation-key-dxp.xml
```

---

### Not enough memory

Elasticsearch and Liferay together need at least 8 GB of RAM available to Docker. On Docker Desktop, go to **Settings → Resources** and increase the memory limit.

---

## Worktree and resource edge cases

### `ldev worktree setup --with-env` stops before creating anything

If the main checkout is still running and the host is not using Btrfs snapshot cloning, this is expected. `ldev` now fails in preflight before creating the worktree, instead of creating it first and then stopping during env preparation.

Stop the main environment first:

```bash
ldev stop
ldev worktree setup --name issue-123 --with-env
```

Or, if you only need the git checkout for now, create it without env preparation:

```bash
ldev worktree setup --name issue-123
```

---

### `ldev resource import-structure` timed out

If the timeout happens after Liferay already accepted the structure update, `ldev` performs a short recovery poll. A recovered run is reported as updated instead of forcing an immediate blind retry.

If recovery still cannot confirm the final state, inspect the structure once and then retry only if needed:

```bash
ldev resource get-structure --site /global --key YOUR_STRUCTURE
ldev resource import-structure --site /global --key YOUR_STRUCTURE
```

---

## Platform-specific limits

### Btrfs worktree features missing on macOS or Windows

This is expected. Btrfs-backed worktree flows are Linux-only.

Use normal `worktree setup`, `worktree env`, and `worktree start` flows without Btrfs, or move that workflow to a Linux host.

---

### Windows host issues

Native Windows is not a supported target.

If you are using WSL2:

- keep the repo inside the Linux filesystem
- avoid Windows-mounted paths for the project root
- treat the setup as experimental

---

### Containers crashed on previous run

```bash
ldev stop
ldev env recreate   # recreate containers keeping volumes
ldev start
```

If that does not help, check logs from the last run:

```bash
ldev logs --no-follow --since 30m
```

---

## `ldev portal check` fails

### OAuth2 not configured

```text
✗ OAuth2 client ID or secret is missing
```

Add credentials to `docker/.env` (or shell env vars). See [Configuration Reference](/configuration#oauth2-setup).

For a standard local environment:

```bash
ldev start
ldev oauth install --write-env
```

If you intentionally configured the read-only credentials, commands that write to the portal will fail until you switch back to the read/write pair.

---

### Portal not reachable from the host

```text
✗ Could not connect to http://localhost:8080
```

1. Confirm Liferay is running: `ldev status`
2. Confirm the URL matches your `BIND_IP` and `LIFERAY_HTTP_PORT` in `docker/.env`
3. If you changed `BIND_IP` to a non-localhost value, also set `LIFERAY_CLI_URL` explicitly:

```bash
LIFERAY_CLI_URL=http://100.115.222.80:8080 ldev portal check
```

---

### Wrong site or scope

`portal` commands target the default site. Pass `--site-id` or `--site` to override:

```bash
ldev portal audit --site /my-site
ldev portal inventory pages --site-id 20121
```

---

## Deploy not reflected in the portal

### Artifact built but not picked up

Check what is in the deploy directory and what OSGi sees:

```bash
ldev deploy status
ldev osgi status my.bundle.symbolic.name
```

---

### Bundle stuck in `INSTALLED` state

The bundle has unsatisfied dependencies. Run `diag` to find out which ones:

```bash
ldev osgi diag my.bundle.symbolic.name
```

Common causes: missing dependency bundle, wrong version range, Service Builder output not deployed.

---

### Theme change not visible

CSS/JS changes in a theme require a full theme build and redeploy:

```bash
ldev deploy theme
```

If still not visible, clear the browser cache or test in a private window.

---

### `deploy watch` not detecting changes

Watch uses file system events. On macOS inside a Docker bind-mount, events can be delayed. Try saving the file again or use `ldev deploy all` for a one-shot rebuild.

---

## Database issues

### Import fails

```bash
ldev db import --file docker/backups/liferay.sql --force
```

`--force` is required to replace an existing database. Without it, the command refuses to overwrite.

---

### Local database is corrupted / out of sync

Re-sync from LCP:

```bash
ldev db sync --force
```

Or restore from a local snapshot:

```bash
ldev restore .ldev/snapshots/my-snapshot --force
```

---

### `db sync` fails — LCP credentials

`db download` and `db sync` need `LCP_PROJECT` and `LCP_ENVIRONMENT` set:

```bash
# in docker/.env
LCP_PROJECT=my-project
LCP_ENVIRONMENT=prd
# or as env vars:
LCP_PROJECT=my-project LCP_ENVIRONMENT=prd ldev db sync
```

---

## OSGi / Gogo Shell

### Can't connect to Gogo Shell

Gogo Shell is only accessible while Liferay is running. Confirm it is healthy first:

```bash
ldev status
ldev osgi gogo "lb | grep -i my-bundle"
```

---

### Thread dump hangs

If the JVM is fully hung, `thread-dump` may also hang. Wait 30 seconds and cancel with `Ctrl+C`. If Liferay is unresponsive, restart:

```bash
ldev env restart
```

---

## Worktrees

### Worktree env not isolated

Each worktree needs its own Docker Compose project name. Set `COMPOSE_PROJECT_NAME` to a unique value in the worktree's `docker/.env` before starting:

```bash
# ldev worktree setup handles this automatically:
ldev worktree setup --name issue-123 --with-env
```

---

### Stale worktree taking up disk space

```bash
ldev worktree gc              # preview what would be removed
ldev worktree gc --apply      # remove stale worktrees
```

---

## General tips

- **Always run `ldev doctor` first** when something is broken. It catches most configuration problems.
- **Check `ldev logs diagnose`** before scrolling through thousands of log lines. It groups exceptions by type.
- **`ldev status --json`** gives machine-readable state useful for debugging scripts.
- Most commands accept `--help` — check the options before guessing.

[Back to Home](/)
