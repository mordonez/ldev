---
title: MCP Server Inventory
description: Candidate ldev commands for MCP tools and more convenient MCP server startup models.
---

# MCP Server Inventory

This inventory classifies the existing `ldev` command surface by how well it fits
the local MCP server.

## Current MCP Surface

The current server registers 15 tools:

| Tool | Source command area | Fit |
| --- | --- | --- |
| `ldev_context` | `context --json` | Strong |
| `liferay_check` | `portal check --json` | Strong |
| `ldev_status` | `status --json` | Strong |
| `ldev_logs_diagnose` | `logs diagnose --json` | Strong |
| `liferay_inventory_sites` | `portal inventory sites` | Strong |
| `liferay_inventory_pages` | `portal inventory pages` | Strong |
| `liferay_inventory_page` | `portal inventory page` | Strong |
| `liferay_inventory_structures` | `portal inventory structures` | Strong |
| `liferay_inventory_templates` | `portal inventory templates` | Strong |
| `liferay_doctor` | `doctor` | Strong |
| `liferay_deploy_status` | `deploy status` | Strong |
| `liferay_osgi_status` | `osgi status` | Strong |
| `liferay_osgi_diag` | `osgi diag <bundle>` | Strong |
| `liferay_osgi_thread_dump` | `osgi thread-dump` | Strong |
| `liferay_mcp_check` | `mcp check` | Strong |

These are good first tools because they return structured results, answer common
agent questions without requiring shell parsing, and keep mutating workflows
CLI-first. `liferay_osgi_thread_dump` is the exception that writes diagnostic
dump artifacts.

## Best Next MCP Tools

These commands should be the next candidates because they are read-only or
diagnostic, have stable JSON output, and are useful before an agent mutates
anything.

| Priority | MCP tool | Backing command/function | Why |
| --- | --- | --- | --- |
| P0 | `ldev_ai_bootstrap` | `ai bootstrap --intent ... --json` / `runAiBootstrap` | Higher-level context plus targeted doctor checks. Useful for discover/develop/deploy/troubleshoot intents. |
| P0 | `liferay_inventory_preflight` | `portal inventory preflight` / `runLiferayPreflight` | Explicit API-surface readiness for inventory/resource workflows. |
| P1 | `reindex_status` | `portal reindex status` / `runReindexStatus` | Common runtime diagnostic after imports or content shrink work. |
| P1 | `reindex_tasks` | `portal reindex tasks` / `runReindexTasks` | Complements `reindex_status` with active task detail. |
| P1 | `liferay_search_indices` | `portal search indices` / `runLiferaySearchIndices` | Good read-only Elasticsearch inventory. |
| P1 | `liferay_search_mappings` | `portal search mappings --index` / `runLiferaySearchMappings` | Helpful for diagnosing indexing/schema issues. |
| P1 | `page_layout_export` | `portal page-layout export` / `runLiferayPageLayoutExport` | Read-only normalized page JSON for page debugging. Prefer returning JSON directly rather than writing `--output`. |
| P1 | `page_layout_diff` | `portal page-layout diff` / `runLiferayPageLayoutDiff` | Strong verification tool for before/after page checks. |
| P1 | `resource_get_structure` | `resource structure` / `runLiferayResourceGetStructure` | Read one resource without filesystem writes. |
| P1 | `resource_get_template` | `resource template` / `runLiferayResourceGetTemplate` | Read one template without filesystem writes. |
| P1 | `resource_get_adt` | `resource adt` / `runLiferayResourceGetAdt` | Read one ADT without filesystem writes. |
| P1 | `resource_list_adts` | `resource adts` / `runLiferayResourceListAdts` | Discovery for ADT work. |
| P1 | `resource_list_fragments` | `resource fragments` / `runLiferayResourceListFragments` | Discovery for fragment work. |

## Conditional MCP Tools

These are useful, but they write files, call external services, run longer
operations, or need stricter guardrails.

| MCP tool | Backing command/function | Suggested rule |
| --- | --- | --- |
| `resource_export_structure` | `resource export-structure` | Allow with explicit output path or return-only mode. |
| `resource_export_template` | `resource export-template` | Allow with explicit output path or return-only mode. |
| `resource_export_structures` | `resource export-structures` | Require explicit `allSites` and cap/error strategy. |
| `resource_export_templates` | `resource export-templates` | Require explicit `allSites`, `continueOnError`, and output directory. |
| `resource_export_adts` | `resource export-adts` | Same as template exports. |
| `resource_export_fragments` | `resource export-fragments` | Same as template exports. |
| `resource_import_*` | `resource import-*` | Expose check-only first. Mutating imports should require a separate `apply: true` input and should reject plural imports unless explicit. |
| `resource_migration_init` | `resource migration-init` | OK as a file-generation tool if `output` is explicit. |
| `resource_migration_run` | `resource migration-run` | Prefer check-only/dry-run first. Mutating mode should require explicit approval input. |
| `resource_migration_pipeline` | `resource migration-pipeline` | Powerful but high-blast-radius; expose after import guardrails exist. |
| `deploy_prepare` | `deploy prepare` | Writes build artifacts but does not touch runtime. Useful after explicit user intent. |
| `deploy_module` / `deploy_theme` | `deploy module`, `deploy theme` | Mutating build/deploy flow; require exact target. |
| `deploy_watch` | `deploy watch` | Long-running; expose only with bounded iterations. |
| `env_wait` | `env wait` | OK as bounded diagnostic with timeout. |
| `env_diff` | `env diff` | Read-only unless `writeBaseline`; reject `writeBaseline` by default. |
| `db_query` | `db query` | Useful but risky; allow read-only `SELECT` first, reject files/mutations unless an explicit unsafe mode exists. |

## Poor MCP Fits

These commands are interactive, destructive, secret-bearing, or better handled by
the human-facing CLI.

| Command | Reason |
| --- | --- |
| `shell` | Interactive terminal session, no structured return. |
| `logs` without `diagnose` | Streaming terminal output; use `logs diagnose` instead. |
| `osgi gogo` | Interactive terminal session. |
| `env clean`, `worktree clean`, `worktree gc --apply` | Destructive local cleanup. |
| `db import --force`, `db sync --force` | Replaces local database state. |
| `db download`, `db sync`, `files-download` | External downloads, credentials, long-running operations. Better as CLI workflows. |
| `project init`, `ai install`, `ai update` | Bootstrap/configuration flows, not normal runtime tools. |
| `auth token` | Secret-bearing result. Prefer health checks that do not return tokens. |
| `config set`, `feature-flags enable/disable`, `reindex speedup-on/off` | Mutates local/portal configuration; expose later only with explicit apply semantics. |
| `content prune` | Potentially destructive portal content operation; keep CLI-first. |

## Startup Options

The current local server uses stdio. In that model the MCP client starts
`ldev-mcp-server` itself, so a separate background daemon is not required and can
actually be the wrong abstraction: stdio needs a process connected to the
client's stdin/stdout.

Implemented improvements:

1. `ldev ai mcp-setup --tool all`.
   This writes `.vscode/mcp.json`, `.claude/mcp.json`, and `.cursor/mcp.json` in
   one run. It solves the real daily friction without changing transport.

2. `ldev ai mcp-setup --target . --tool vscode --strategy local|global|npx`.
   Today strategy is auto-detected. An explicit strategy lets a developer force a
   local project dependency for reproducible worktrees or force global for speed.

3. `ldev mcp doctor`.
   This should validate the generated config file, resolve the command on PATH,
   run `ldev-mcp-server --version`, and optionally perform a minimal MCP
   initialize/list-tools handshake. This is more valuable than a background
   process for stdio clients.

Future option:

1. Add a non-stdio transport later: `ldev serve --transport http --port 0`.
   This would make a background server meaningful. It should write a pid/log file
   under a project-local runtime directory and expose `ldev serve status` and
   `ldev serve stop`. Only do this if target clients support connecting to an
   HTTP MCP server in the desired config format.

2. If background stdio is still desired for manual testing, add a bounded helper,
   not a production path: `ldev serve test-client --list-tools`. It can spawn the
   stdio server, run the MCP handshake, print the available tools, then exit.

Best near-term path: keep stdio client-managed and use `ldev mcp doctor` when a
client does not load the expected tools. Defer background mode until there is an
HTTP transport use case.
