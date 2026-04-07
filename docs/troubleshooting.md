---
title: Troubleshooting
---

# Troubleshooting

Start with `ldev doctor`, then `ldev logs diagnose` for detailed diagnosis.

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
ldev logs follow --service liferay     # Stream logs
ldev logs diagnose                      # Full diagnosis
```

Common causes:
- Activation key expired or invalid
- Not enough memory/disk
- Port conflict
- Corrupted data directory: `ldev env clean` then `ldev start`

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

---

## Database & Import Issues

### `ldev db import` times out or fails

**Cause**: Database too large or corrupted backup.

**Fix**:

```bash
ldev db import --verbose           # See what's happening
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
ldev env clean                 # Delete data
ldev db download               # Re-download
ldev db import                 # Re-import
```

---

## Deployment Issues

### Deploy completes but changes don't appear

**Cause**: Bundle stuck, or app not reloaded.

**Fix**:

```bash
ldev deploy prepare               # Build only
ldev osgi status                  # Check bundle state
ldev env restart                  # Full restart
```

### Deploy fails with "artifact not found"

**Cause**: Build failed or wrong module name.

**Fix**:

```bash
ldev deploy prepare               # Test build without deploying
# Check error output and fix build
```

---

## Portal Issues

### Elasticsearch not responding / reindex stuck

**Cause**: Elasticsearch OOM or corrupted indices.

**Fix**:

```bash
ldev env clean                        # Clean all data
ldev start                            # Fresh start
ldev portal reindex speedup-on         # Reindex
```

### Search queries return no results

**Cause**: Content not indexed.

**Fix**:

```bash
ldev portal reindex speedup-on         # Full reindex
ldev portal search indices            # Verify indices exist
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
ldev status              # Check main environment
ldev stop                # Stop main if running
ldev worktree setup --name task-123 --with-env
```

### Worktree takes too much disk space

**Cause**: Multiple worktrees with separate Docker data.

**Fix**:

```bash
ldev worktree gc                  # Clean unused worktrees
ldev worktree clean --force       # Delete specific worktree
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

For verbose output:

```bash
ldev logs follow --service liferay      # Stream Liferay logs
ldev logs follow --service elasticsearch # Stream Elasticsearch logs
```

---

## Still Stuck?

1. Run: `ldev logs diagnose` (provides full context)
2. Check: [Support Matrix](/support-matrix) for platform/host issues
3. See: [Commands Reference](/commands) for detailed command options
4. Explore: `ldev <command> --help` for all flags

---

## See Also

- [First Run Walkthrough](/first-run-walkthrough) — Expected behavior
- [Configuration](/configuration) — Environment variables
- [Support Matrix](/support-matrix) — Platform compatibility
