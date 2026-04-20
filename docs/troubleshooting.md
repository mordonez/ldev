---
title: Troubleshooting
description: Common error patterns and fixes for ldev runtimes, Docker issues, and portal authentication failures.
---

# Troubleshooting

Start with `ldev doctor`, then `ldev logs diagnose` for detailed diagnosis.

`ldev` normalizes errors into a stable envelope:

```json
{
  "code": "OAUTH_INSTALL_OPTION_INVALID",
  "exitCode": 2,
  "message": "--user-id requires --company-id."
}
```

Codes come from per-feature factories (`EnvErrors`, `WorktreeErrors`, `DeployErrors`, `DbErrors`, `OAuthErrors`, `LiferayErrors`). Match on `code` in scripts; `message` is safe to display.

---

## Startup Issues

### Docker not running

```text
[FAIL] Docker Daemon: docker CLI is available but the daemon is not responding
```

**Fix**: Start Docker Desktop (or `sudo systemctl start docker` on Linux).

### Port already in use

```text
[WARN] HTTP Port: localhost:8080 is already in use
```

**Fix**: Change port in `docker/.env`:

```bash
LIFERAY_HTTP_PORT=8181
```

### Low host memory

```text
[WARN] Host Memory: 4.0 GiB is below recommended 8 GB
```

**Fix**: Allocate more RAM to Docker, or close other apps. Minimum 8 GB required.

### Activation key invalid or missing

```text
[FAIL] Activation Key: path does not exist
```

**Fix**:
```bash
export LDEV_ACTIVATION_KEY_FILE=/path/to/activation-key-dxp-*.xml
ldev start
```

### Portal not starting (timeout)

```text
Health wait: liferay health endpoint not responding
```

**Fix**: Check logs:

```bash
ldev logs --service liferay --since 10m     # Stream recent logs
ldev logs diagnose --json                    # Full diagnosis
```

Common causes:
- Activation key expired or invalid
- Not enough memory/disk
- Port conflict
- Corrupted data directory: `ldev env clean --force` then `ldev start`

---

## OAuth & Authentication

### OAuth install fails

**Cause**: Portal setup wizard not completed or wrong credentials.

**Fix**:
1. Open http://localhost:8080
2. Log in with `test@liferay.com` / `test`
3. Complete setup wizard
4. Run: `ldev oauth install --write-env`

### Portal check fails: "401 Unauthorized"

**Cause**: OAuth2 credentials missing or invalid.

**Fix**:

```bash
ldev oauth install --write-env     # Re-register apps
ldev oauth admin-unblock           # Clear password-reset gate
ldev portal check                  # Retry
```

### "Portal requires first login"

**Cause**: Setup wizard not completed.

**Fix**: Manually complete setup at http://localhost:8080, then retry OAuth install.

### OAuth quick diagnosis checklist

When OAuth keeps failing, run this sequence in order:

```bash
ldev context --json
ldev portal check
ldev portal auth token --raw
ldev oauth install --write-env
ldev portal check
```

What to verify in the output:
- `liferay.url` points to the expected portal host/port.
- `liferay.oauth2ClientId` and `liferay.oauth2ClientSecret` are present after install.
- `ldev portal check` returns success after reinstalling OAuth.

### OAuth error signatures and fixes

#### `invalid_client` or `401` during token fetch

**Cause**: Stale or mismatched OAuth credentials.

**Fix**:
```bash
ldev oauth install --write-env
ldev portal check
```

If it persists, check for conflicting shell variables overriding local config and unset them before retrying.

#### `403 Forbidden` on API calls after successful token fetch

**Cause**: OAuth app exists but scopes/permissions are incomplete for the endpoint.

**Fix**:
1. Re-run `ldev oauth install --write-env`.
2. Retry the failing command.
3. If still failing, confirm portal-side OAuth app permissions for the target API.

#### Connection refused / timeout during OAuth install

**Cause**: Portal is not reachable at the configured URL.

**Fix**:
```bash
ldev doctor
ldev status
ldev logs diagnose
```

Then verify `.liferay-cli.local.yml` points to the active local portal URL.

#### OAuth install succeeds but later commands still fail

**Cause**: Credentials were written correctly, but another config source is overriding them.

**Fix**:
1. Check environment variables first (highest precedence).
2. Confirm `.liferay-cli.local.yml` contains the expected OAuth values.
3. Re-run `ldev context --json` to confirm the effective resolved values.

---

## Database & Import Issues

### `ldev db import` times out or fails

**Cause**: Database too large or corrupted backup.

**Fix**:

```bash
ldev db import --force                       # Retry with a clean import
# If it fails, check post-import script syntax:
cat docker/sql/post-import.d/010-adapt-local-db.sql | head -20
```

### `ldev db download` fails (LCP credentials)

**Cause**: Invalid LCP_PROJECT or LCP_ENVIRONMENT in `docker/.env`.

**Fix**: Verify in `docker/.env`:

```bash
LCP_PROJECT=my-actual-lcp-project     # Check spelling
LCP_ENVIRONMENT=staging               # dev, staging, or prd
```

### Database corrupted after import

**Cause**: Post-import SQL script error or data corruption.

**Fix**: Reimport from backup:

```bash
ldev env clean --force         # Delete data
ldev db download               # Re-download
ldev db import --force         # Re-import
```

---

## Deployment Issues

### Deploy completes but changes don't appear

**Cause**: Bundle stuck, or app not reloaded.

**Fix**:

```bash
ldev deploy prepare               # Build only
ldev osgi status com.acme.foo.web # Check bundle state
ldev env restart                  # Full restart
```

### Deploy fails with "artifact not found"

**Cause**: Build failed or wrong module name.

**Fix**:

```bash
ldev deploy prepare               # Test build without deploying
# Check error output and fix build
```

### Deploy reports partial hot deploy

**Cause**: One or more artifacts could not be copied to the running container.

**Fix**:

```bash
ldev deploy prepare               # Rebuild artifacts
ldev deploy module foo-web        # Retry module deploy
```

If output says that only some artifacts were deployed, treat it as a failed deploy and use the reported artifact errors to fix the failing module/theme first.

### Deploy cache lock timeout

```text
Timed out waiting for deploy cache lock
```

**Cause**: Another deploy command is running at the same time, or a previous deploy was interrupted.

**Fix**:

1. Wait for the other deploy to finish, then retry.
2. If no deploy is running, run `ldev env restart` and retry the deploy command.

---

## Portal Issues

### Elasticsearch not responding / reindex stuck

**Cause**: Elasticsearch OOM or corrupted indices.

**Fix**:

```bash
ldev env clean --force                 # Clean all data
ldev start                             # Fresh start
ldev portal reindex speedup-on         # Reindex
```

### Search queries return no results

**Cause**: Content not indexed.

**Fix**:

```bash
ldev portal reindex speedup-on         # Full reindex
ldev portal search indices             # Verify indices exist
```

### Portal shows old data

**Cause**: Cache not cleared.

**Fix**: Restart Liferay:

```bash
ldev env restart
```

---

## Worktree Issues

### `ldev worktree setup --with-env` fails

**Cause**: Not enough disk space or `main` environment still running.

**Fix**:

```bash
ldev status                                       # Check main environment
ldev stop                                         # Stop main if running
ldev worktree setup --name task-123 --with-env
```

### Worktree takes too much disk space

**Cause**: Multiple worktrees with separate Docker data.

**Fix**:

```bash
ldev worktree gc --days 14 --apply           # Remove stale worktrees
ldev worktree clean task-123 --force         # Delete a specific worktree
```

---

## Quick Diagnostic Commands

When stuck, run:

```bash
ldev doctor                    # Check prerequisites
ldev status                    # Show container status
ldev logs diagnose             # Full diagnosis
ldev context --json            # Current configuration
ldev portal check              # Portal health
```

For live log streaming:

```bash
ldev logs --service liferay --since 10m         # Recent Liferay logs
ldev logs --service elasticsearch --since 10m   # Recent Elasticsearch logs
```

---

## Still Stuck?

1. Run: `ldev logs diagnose` (provides full context)
2. Check: [FAQ](/reference/faq) for common platform and usage questions
3. See: [Commands Reference](/commands/) for detailed command options
4. Explore: `ldev <command> --help` for all flags

---

## See Also

- [First Incident](/getting-started/first-incident) — Practical diagnosis flow
- [Configuration](/reference/configuration) — Environment variables
- [FAQ](/reference/faq) — Common platform and workflow questions
