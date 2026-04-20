---
title: Command Reference
description: Minimal command reference for ldev, organized by maintenance workflow.
---

# Command Reference

Commands are reference, not the main way to learn `ldev`.

Start with:

- [Diagnose an Issue](/workflows/diagnose-issue)
- [First Incident](/getting-started/first-incident)
- [Explore a Portal](/workflows/explore-portal)

Reference sections:

- [Runtime](/commands/runtime)
- [Discovery](/commands/discovery)
- [Data and Deploy](/commands/data-and-deploy)
- [Resources](/commands/resources)
- [Project and AI](/commands/project-and-ai)
- [Advanced](/commands/advanced)

## Namespace overview

Main entry points promoted to the top level:

- `ldev context`, `ldev doctor`
- `ldev setup`, `ldev start`, `ldev stop`, `ldev status`
- `ldev logs`, `ldev logs diagnose`, `ldev shell`

Namespaces:

- `ldev portal` (alias: `ldev liferay`) — check, auth, config, inventory, audit, content, page-layout, search, theme-check, reindex
- `ldev resource` — read, export, import, migration
- `ldev db` — database and Document Library workflows
- `ldev deploy` — build and runtime deploy flows
- `ldev env` — advanced environment operations
- `ldev osgi` — Gogo Shell and runtime diagnostics
- `ldev worktree` — isolated branch worktrees
- `ldev oauth` — OAuth2 app installation
- `ldev mcp` — Liferay MCP server inspection
- `ldev feature-flags` — portal feature flag toggles
- `ldev project` — project scaffold
- `ldev ai` — reusable AI assets and skills

Liferay connection overrides are available on `ldev portal` and `ldev resource`:

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

Use `ldev <namespace> --help` for the full options of your installed version.
