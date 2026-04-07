---
title: First Run Walkthrough
---

# First Run Walkthrough

A realistic end-to-end `ldev` flow for a fresh DXP local environment. This is longer than [Quickstart](/quickstart) for confidence, not verbosity.

**Total time**: ~20-30 minutes (excluding DXP startup waiting time).

---

## Command Flow

```bash
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev ai install --target .
ldev doctor
ldev setup
ldev start --activation-key-file /path/to/activation-key.xml
ldev oauth install --write-env
ldev oauth admin-unblock
ldev status
ldev portal inventory sites --json
ldev resource export-templates
ldev resource export-structures
ldev ai install --target . --project  # optional
ldev stop
```

---

## Step-by-Step

### 1. Create Project

```bash
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
```

Creates:
- `docker/` — Docker Compose setup
- `liferay/` — Project structure
- `docker/.env` — Environment config
- `.liferay-cli.yml` — ldev configuration

### 2. Install AI Skills (Optional)

```bash
ldev ai install --target .
```

Installs:
- `AGENTS.md` — Agent bootstrap
- `CLAUDE.md` — Project context
- `.agents/skills/` — Vendor skills

See [AI Integration](/ai-integration) for details.

### 3. Validate Prerequisites

```bash
ldev doctor
```

Checks:
- Docker CLI and daemon
- Project layout
- Host memory (8+ GB)
- Port conflicts
- OAuth2 setup

Fix any **[FAIL]** items before continuing.

### 4. Prepare Environment

```bash
ldev setup
```

- Creates `docker/.env`
- Prepares data directories
- Selects compose profile

### 5. Start DXP

```bash
ldev start --activation-key-file /path/to/activation-key-dxp.xml
```

Or set environment variable:

```bash
export LDEV_ACTIVATION_KEY_FILE=/path/to/activation-key-dxp.xml
ldev start
```

**Startup time**: 3-5 minutes for first run (schema initialization).

Verify:

```bash
ldev status     # Check containers
ldev portal check     # Check portal health
```

### 6. Install OAuth2 Apps

```bash
ldev oauth install --write-env
```

Creates OAuth2 apps in the portal for authenticated commands.

When prompted: use default admin credentials (`test@liferay.com` / `test`).

### 7. Unblock Admin

```bash
ldev oauth admin-unblock
```

Clears the initial password-reset gate so `ldev` commands work immediately.

### 8. Verify Setup

```bash
ldev status                    # All containers healthy
ldev portal check              # Portal responding
ldev portal inventory sites    # Can query sites
```

### 9. Export Resources (Optional)

```bash
ldev resource export-templates
ldev resource export-structures
ldev resource export-adts
ldev resource export-fragments
```

Exports content definitions to version control under `liferay/resources/`.

### 10. Install Project Overlays (Optional)

```bash
ldev ai install --target . --project --project-context
```

Adds project-specific AI context if your team maintains it.

### 11. Stop When Done

```bash
ldev stop
```

---

## What Success Looks Like

You should have:

✓ Working local DXP on http://localhost:8080  
✓ `docker/.env` with `LIFERAY_CLI_OAUTH2_CLIENT_ID` and `...SECRET`  
✓ AI bootstrap files (`AGENTS.md`, `.agents/skills/`)  
✓ Exported structures/templates under `liferay/resources/`  
✓ Successful responses from `portal check`, `portal inventory`, etc.

---

## Daily Workflow After First Run

```bash
ldev start                          # Start services
ldev portal inventory page --url /  # Explore
# ... development ...
ldev stop                           # Stop when done
```

---

## Troubleshooting

### Portal not responding after startup

```bash
ldev logs diagnose          # Detailed diagnosis
ldev logs follow --service liferay    # Stream logs
```

### OAuth install fails

Portal setup wizard must be completed first:

1. Open http://localhost:8080
2. Log in with `test@liferay.com` / `test`
3. Accept Terms of Use
4. Set new password
5. Run `ldev oauth install --write-env` again

### Port conflict

If port 8080 is in use, edit `docker/.env`:

```bash
LIFERAY_HTTP_PORT=8081
```

---

## Next Steps

- [Commands Reference](/commands) — Full CLI reference
- [PaaS to Local Migration](/paas-to-local-migration) — Migrate from production
- [Resource Migration Pipeline](/resource-migration-pipeline) — Safe structure migrations
- [AI Integration](/ai-integration) — Agent workflows
- [Troubleshooting](/troubleshooting) — Common issues
