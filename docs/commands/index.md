---
title: Command Reference
description: Pure command reference for ldev, organized by capability area.
---

# Command Reference

This is the reference, not the place to learn `ldev`.

If you want to understand what `ldev` is for, start with:

- [What is ldev](/getting-started/what-is-ldev)
- [Export and Import Resources](/workflows/export-import-resources) (the
  flagship workflow)
- [Resource Migration Pipeline](/workflows/resource-migration-pipeline) (the
  workflow Liferay does not have)
- [First Incident](/getting-started/first-incident) (a triage walkthrough)

## Reference sections

- [Runtime](/commands/runtime) — start, stop, doctor, logs, env lifecycle
- [Discovery](/commands/discovery) — context, portal check, inventory,
  preflight, OAuth
- [Data and Deploy](/commands/data-and-deploy) — db sync/import, document
  library, deploy module/theme/all, content prune
- [Resources](/commands/resources) — structures, templates, ADTs, fragments,
  migration
- [Project and AI](/commands/project-and-ai) — project init, ai
  install/update/status/bootstrap
- [Advanced](/commands/advanced) — OSGi, worktrees, MCP, reindex, search,
  page-layout, theme-check

## Namespace overview

Top-level entry points:

- `ldev --repo-root <path> ...` — target another local checkout root
- `ldev context`, `ldev doctor`
- `ldev setup`, `ldev start`, `ldev stop`, `ldev status`
- `ldev logs`, `ldev logs diagnose`, `ldev shell`

Namespaces:

- `ldev portal` (alias `ldev liferay`) — check, auth, config, inventory,
  audit, content, page-layout, search, theme-check, reindex
- `ldev resource` — read, export, import, migration
- `ldev db` — database and Document Library workflows
- `ldev deploy` — build and runtime deploy flows
- `ldev env` — advanced environment operations
- `ldev osgi` — Gogo Shell wrappers and runtime diagnostics
- `ldev worktree` — isolated branch worktrees with their own runtime state
- `ldev oauth` — OAuth2 app installation
- `ldev mcp` — local Liferay MCP server inspection
- `ldev project` — project scaffold
- `ldev ai` — managed AI assets and skills

## Connection overrides

`ldev portal` and `ldev resource` accept Liferay connection overrides for
remote execution:

```bash
ldev portal [options] <subcommand>
ldev resource [options] <subcommand>

--liferay-url <url>
--liferay-client-id <clientId>
--liferay-client-secret <clientSecret>
--liferay-client-secret-env <envVar>
--liferay-scope-aliases <aliases>
--liferay-timeout-seconds <seconds>
```

See [Configuration](/reference/configuration) for precedence and secret
handling.

Use `ldev <namespace> --help` for the full options of your installed
version.
