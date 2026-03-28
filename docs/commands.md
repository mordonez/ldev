---
layout: default
title: Command Reference
---

# Command Reference

## Core Commands

Daily workflow commands available at the top level.

| Command | Description |
|---|---|
| `ldev doctor` | Validate host prerequisites and project configuration |
| `ldev setup` | Pull Docker images and seed initial configuration |
| `ldev start` | Start the Liferay development environment |
| `ldev stop` | Stop running containers |
| `ldev status` | Show container and service state |
| `ldev logs` | Stream container logs (`--no-follow` for dump) |
| `ldev shell` | Open an interactive shell in the Liferay container |
| `ldev context` | Display resolved project context (paths, config, URLs) |

## Workspace Commands

Project creation and worktree management.

| Command | Description |
|---|---|
| `ldev project init` | Create a new project with full scaffold |
| `ldev project add` | Add ldev support to an existing project |
| `ldev project add-community` | Add Docker/Liferay scaffold to existing project |
| `ldev worktree setup` | Create an isolated worktree environment |
| `ldev worktree clean` | Remove worktree environments |
| `ldev worktree gc` | Garbage collect stale worktrees |

## Runtime Commands

Environment, database, deployment, and OSGi management.

### env

| Command | Description |
|---|---|
| `ldev env setup` | Pull images and seed configs |
| `ldev env start` | Start containers |
| `ldev env stop` | Stop containers |
| `ldev env status` | Container status |
| `ldev env logs` | Container logs |
| `ldev env shell` | Interactive Liferay shell |
| `ldev env recreate` | Force-recreate containers |
| `ldev env clean` | Remove containers and volumes |
| `ldev env restore` | Restore from backup |

### db

| Command | Description |
|---|---|
| `ldev db sync` | Sync database from a remote environment |
| `ldev db import` | Import a SQL dump |
| `ldev db download` | Download database backup |

### deploy

| Command | Description |
|---|---|
| `ldev deploy module <name>` | Compile and deploy a single module |
| `ldev deploy all` | Deploy all modules |
| `ldev deploy theme <name>` | Deploy a theme |
| `ldev deploy prepare` | Run build service if needed |

### osgi

| Command | Description |
|---|---|
| `ldev osgi thread-dump` | Capture JVM thread dump |
| `ldev osgi creds` | Show Liferay CLI OAuth2 credentials |

## Liferay Commands

API operations for Liferay DXP instances.

### liferay auth

| Command | Description |
|---|---|
| `ldev liferay auth token` | Get an OAuth2 access token |
| `ldev liferay auth check` | Verify API connectivity |

### liferay inventory

| Command | Description |
|---|---|
| `ldev liferay inventory sites` | List all sites |
| `ldev liferay inventory pages` | List pages for a site |
| `ldev liferay inventory page` | Show page details |
| `ldev liferay inventory structures` | List DDM structures |
| `ldev liferay inventory templates` | List DDM templates |

### liferay resource

| Command | Description |
|---|---|
| `ldev liferay resource export-structures` | Export DDM structures |
| `ldev liferay resource export-templates` | Export DDM templates |
| `ldev liferay resource export-adts` | Export ADTs |
| `ldev liferay resource export-fragments` | Export fragments |
| `ldev liferay resource import-structures` | Import DDM structures |
| `ldev liferay resource import-templates` | Import DDM templates |
| `ldev liferay resource import-adts` | Import ADTs |
| `ldev liferay resource sync-structure` | Two-way sync a structure |
| `ldev liferay resource sync-template` | Two-way sync a template |
| `ldev liferay resource sync-adt` | Two-way sync an ADT |
| `ldev liferay resource sync-fragments` | Two-way sync fragments |
| `ldev liferay resource migration` | Run resource migration plan |

### liferay page-layout

| Command | Description |
|---|---|
| `ldev liferay page-layout diff` | Diff page layout definitions |
| `ldev liferay page-layout export` | Export page layout definitions |

## Output Formats

Commands that support structured output accept:

```bash
ldev doctor --json          # Pretty-printed JSON
ldev doctor --ndjson        # Newline-delimited JSON
ldev doctor --format json   # Explicit format flag
```

See [Automation Contract](automation) for full specification.

[Back to Home](./)
