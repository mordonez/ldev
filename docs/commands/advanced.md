---
title: Advanced Commands
description: Minimal reference for OSGi diagnostics, worktrees, MCP, and specialized tooling.
---

# Advanced Commands

## OSGi runtime

```bash
ldev osgi status com.acme.foo.web
ldev osgi diag com.acme.foo.web
ldev osgi thread-dump --count 6 --interval 3
ldev osgi heap-dump
ldev osgi gogo
```

- `status <bundle>` / `diag <bundle>` — inspect a bundle symbolic name
- `gogo` — open an interactive Gogo Shell session
- `thread-dump` — collect one or more thread dumps
- `heap-dump` — generate a heap dump

## Worktrees

Create an isolated git worktree and (optionally) prepare its local env.

```bash
ldev worktree setup --name incident-123 --with-env
ldev worktree setup --name feature-x --base origin/main --with-env
ldev worktree setup --name feature-x --with-env --stop-main-for-clone
ldev worktree setup --name feature-x --with-env --stop-main-for-clone --restart-main-after-clone
cd .worktrees/incident-123
ldev start

ldev worktree start incident-123
ldev worktree env --name incident-123
ldev worktree clean incident-123 --force
ldev worktree clean incident-123 --force --delete-branch
ldev worktree gc --days 14
ldev worktree gc --days 14 --apply
```

- `setup` — create or reuse a worktree under `.worktrees/<name>`
- `setup --stop-main-for-clone` — opt-in: stop main automatically when a non-Btrfs clone needs exclusive access
- `setup --restart-main-after-clone` — opt-in: after an automatic stop, start main again without waiting for full portal readiness
- `start` — prepare and start the worktree's local env
- `env` — prepare or inspect the worktree's local env wiring
- `clean` — destructive; requires `--force`; optionally deletes `fix/<name>` branch
- `gc` — preview (default) or `--apply` removal of stale worktrees older than `--days`

### BTRFS snapshots (Linux)

On Linux with BTRFS filesystems, `ldev` uses subvolume snapshots to accelerate worktree environment creation.

```bash
ldev worktree btrfs-refresh-base
```

Re-seeds `BTRFS_BASE` from the current main env data root. `env restore` uses this as the source when available.

## MCP

Inspect the Liferay MCP server and its runtime availability.

```bash
ldev mcp check --json
ldev mcp probe --json
ldev mcp openapis --json
```

- `check` — detect endpoint candidates and feature flag state
- `probe` — run a real MCP initialize handshake
- `openapis` — call the MCP `get-openapis` tool after initialize

Auth options (all three subcommands):

```bash
ldev mcp probe --authorization-header 'Basic ...'
ldev mcp probe --username admin --password '***'
```

Environment fallbacks: `LIFERAY_MCP_AUTHORIZATION_HEADER`, `LIFERAY_MCP_USERNAME`, `LIFERAY_MCP_PASSWORD`.

## Reindex

Inspect or temporarily tune portal reindex execution.

```bash
ldev portal reindex status
ldev portal reindex watch --interval 5 --iterations 60
ldev portal reindex tasks
ldev portal reindex speedup-on
ldev portal reindex speedup-off
```

`speedup-on` sets `refresh_interval=-1` while a reindex is running; `speedup-off` restores it to `1s`.

## Search

Direct Elasticsearch inspection, broader than `portal reindex status`.

```bash
ldev portal search indices
ldev portal search mappings --index liferay-0
ldev portal search query --index liferay-0 --query '*'
ldev portal search query --index liferay-0 --body '{"query":{"match_all":{}}}'
```

## Page layout

Export and diff content pages.

```bash
ldev portal page-layout export --url /web/guest/home --output pages/home.json
ldev portal page-layout diff --url /web/guest/home --file pages/home.json
ldev portal page-layout diff --url /web/guest/home --reference-url /web/guest/home-candidate
```

`diff` exits with code `1` when pages differ, for use in pipelines.

## Theme check

Validate Clay icon coverage for a deployed theme.

```bash
ldev portal theme-check --theme ub-theme --json
```
