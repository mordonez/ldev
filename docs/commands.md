---
title: Command Reference
---

> **Quick tip:** Every command has `--help`. When in doubt: `ldev <command> --help`.

## Start Here

Safe daily flow:

```bash
ldev doctor                              # Validate prerequisites
ldev start                               # Start environment
ldev oauth install --write-env           # Configure OAuth2
ldev portal check                        # Verify portal is ready
ldev portal inventory page --url /       # Explore portal
```

Troubleshooting:

```bash
ldev logs diagnose                       # What went wrong?
ldev status                              # Current state
```

---

## Core Commands by Category

### Project Setup

| Command | Purpose |
|---------|---------|
| `ldev project init --name <name> --dir .` | Initialize ldev-native project |
| `ldev doctor` | Validate prerequisites before starting |
| `ldev setup` | Prepare Docker environment |

### Runtime Control

| Command | Purpose |
|---------|---------|
| `ldev start [--activation-key-file <path>]` | Start Liferay + services |
| `ldev stop` | Stop all containers |
| `ldev status` | Show container status |
| `ldev logs [--service liferay]` | Stream logs |
| `ldev logs diagnose` | Diagnose startup/health issues |

### Portal Inspection

| Command | Purpose |
|---------|---------|
| `ldev portal check` | Portal health check |
| `ldev portal inventory sites` | List all sites (JSON) |
| `ldev portal inventory page --url /web/guest/home` | Inspect page structure |
| `ldev portal inventory structures --site /my-site` | List structures |
| `ldev portal audit` | Portal configuration audit |

### Authentication & OAuth2

| Command | Purpose |
|---------|---------|
| `ldev oauth install --write-env` | Register OAuth2 app in portal |
| `ldev oauth admin-unblock` | Unblock admin for first login |
| `ldev portal auth token` | Get OAuth2 token |

### Database & Data

| Command | Purpose |
|---------|---------|
| `ldev db download [--env staging]` | Download database from LCP |
| `ldev db import` | Import database + run post-import scripts |
| `ldev db query "<sql>"` | Execute SQL query |
| `ldev db files-download --background` | Download Document Library |

### Content Resources

| Command | Purpose |
|---------|---------|
| `ldev resource export-structures --site /my-site` | Export structures to JSON |
| `ldev resource export-templates` | Export templates |
| `ldev resource import-structures --apply` | Import structures to portal |
| `ldev resource import-templates --apply` | Import templates |

### Deployment

| Command | Purpose |
|---------|---------|
| `ldev deploy all` | Build and deploy all modules |
| `ldev deploy module <name>` | Build and deploy single module |
| `ldev deploy theme` | Build and deploy theme |
| `ldev deploy prepare` | Build only (no deploy) |
| `ldev deploy watch --module <name>` | Watch for changes and redeploy |

### Indexing & Search

| Command | Purpose |
|---------|---------|
| `ldev portal reindex speedup-on` | Enable speedup mode and reindex |
| `ldev portal reindex speedup-off` | Disable speedup mode |
| `ldev portal search indices` | List Elasticsearch indices |

### Worktrees (Isolated Branches)

| Command | Purpose |
|---------|---------|
| `ldev worktree setup --name <name> --with-env` | Create isolated branch environment |
| `ldev worktree clean --force --delete-branch` | Cleanup and delete worktree |

### AI Integration

| Command | Purpose |
|---------|---------|
| `ldev ai install --target .` | Install vendor AI skills |
| `ldev ai install --target . --project` | Also install project overlays |
| `ldev ai update --target .` | Update vendor skills |

### Diagnostics & MCP

| Command | Purpose |
|---------|---------|
| `ldev context --json` | Project snapshot (paths, URL, auth) |
| `ldev mcp check` | Check MCP health |

---

## Specialized Commands

Use these for advanced workflows. Details in `--help`:

**Environment**:
```bash
ldev env restart          # Restart all containers
ldev env recreate         # Recreate from scratch
ldev env clean            # Clean data volumes
ldev env is-healthy       # Health check
```

**OSGi**:
```bash
ldev osgi status          # Bundle status
ldev osgi diag            # Diagnostic output
ldev osgi thread-dump     # Thread dump to file
ldev osgi heap-dump       # Heap dump to file
```

**Portal**:
```bash
ldev portal search query "<query>"       # Execute search query
ldev portal config get <key>             # Get portal setting
ldev portal page-layout export --url /   # Export page layout
ldev portal theme-check                  # Validate theme
```

---

## All Commands (Complete List)

For exhaustive command reference, use `ldev --help` or `ldev <namespace> --help`.

Navigator by category:

- **project**: init
- **doctor, setup, start, stop, status**: Environment lifecycle
- **context, logs, shell**: Information & debugging
- **portal**: audit, check, auth, inventory, config, search, reindex, page-layout, theme-check
- **resource**: export, import, audit
- **deploy**: all, module, theme, service, watch, prepare, status, cache-update
- **db**: sync, download, import, query, files-download, files-mount, files-detect
- **env**: init, restart, recreate, restore, clean, wait, diff, is-healthy
- **osgi**: gogo, status, diag, thread-dump, heap-dump
- **worktree**: setup, start, env, clean, gc, btrfs-refresh-base
- **ai**: install, update
- **mcp**: check, probe, openapis

---

## Command Roles (For Agents)

**Agent-core** (recommended for agent-assisted workflows):

```bash
ldev doctor --json
ldev context --json
ldev status --json
ldev portal check --json
ldev portal inventory ... --json
ldev logs diagnose --json
ldev oauth install --json
ldev mcp check --json
```

**Runtime-core** (essential for lifecycle):

```bash
ldev setup
ldev start / stop
ldev logs
ldev deploy ...
ldev db ...
ldev env ...
ldev worktree ...
```

**Specialized** (narrower use cases):

```bash
ldev resource ...
ldev portal search ...
ldev portal reindex ...
ldev portal page-layout ...
ldev mcp probe
```

---

## Help System

Every command has built-in help:

```bash
ldev --help                    # Full CLI
ldev <namespace> --help        # Namespace help (e.g., ldev portal --help)
ldev <command> --help          # Specific command
```

Help is the source of truth for:
- All flags and options
- Latest changes
- Examples for your version

---

## JSON Output

Core commands support `--json` or `--ndjson` for scripting:

```bash
ldev status --json
ldev context --json
ldev portal inventory sites --json
ldev portal inventory page --url / --json
ldev doctor --json
ldev logs diagnose --json
```

JSON output includes `ok: true/false` and error details. Stable contract documented in [Automation](/automation).

---

## See Also

- [First Run Walkthrough](/first-run-walkthrough) — Realistic example session
- [Configuration](/configuration) — Environment variables and config files
- [AI Integration](/ai-integration) — AI skills and agent workflows
- [PaaS to Local Migration](/paas-to-local-migration) — Migrate from Liferay Cloud
- [Worktree Environments](/worktree-environments) — Isolated branch testing
- [Automation](/automation) — Machine-readable output contract
