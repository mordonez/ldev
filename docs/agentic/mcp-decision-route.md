---
title: MCP Decision Route
description: When agents should use ldev MCP tools, CLI fallbacks, and installed skills.
---

# MCP Decision Route

`ldev` has three agent-facing layers:

| Layer | Role | Required? |
| --- | --- | --- |
| CLI | Canonical execution contract and universal fallback | Yes |
| MCP tools | Structured acceleration over selected `ldev` workflows | No |
| Skills | Decision playbooks, guardrails, and domain workflow memory | Yes |

The rule is:

```text
Skills decide what should happen.
MCP tools execute structured diagnosis/discovery when available.
CLI remains the source of truth and fallback for every workflow.
```

## Default Decision Route

1. Start from the task-specific skill when one applies.
2. For discovery or diagnosis, use an MCP tool if it is visible in the client.
3. If the MCP tool is not visible, use the equivalent CLI command with `--json`.
4. For mutations or artifact-generating diagnosis, prefer CLI workflows and skill guardrails unless a tool documents the write explicitly.
5. If a client is expected to expose MCP tools but does not, run `ldev mcp doctor`.

## MCP Server Practice

The local `ldev` MCP server follows the current MCP shape for CLI projects:

- use stdio for local editor-launched tools; a background process is only useful
  once an HTTP transport exists
- keep tool names stable, unique, and namespaced by domain
- validate tool inputs through the SDK schema layer and keep additional runtime
  guards where a tool can write artifacts or run for a long time
- return JSON as both structured content and serialized text so newer clients
  get typed payloads while older clients still receive readable output
- report tool execution failures with MCP tool errors, not protocol failures, so
  agents can self-correct
- keep sensitive or mutating workflows CLI-first unless the tool has explicit
  apply semantics and user-visible approval expectations

## MCP to CLI Fallbacks

| Intent | Prefer MCP tool | CLI fallback |
| --- | --- | --- |
| Project snapshot | `ldev_context` | `ldev context --json` |
| Portal auth/reachability | `liferay_check` | `ldev portal check --json` |
| Runtime status | `ldev_status` | `ldev status --json` |
| Log diagnosis | `ldev_logs_diagnose` | `ldev logs diagnose --since 10m --json` |
| Site discovery | `liferay_inventory_sites` | `ldev portal inventory sites --json` |
| Page tree | `liferay_inventory_pages` | `ldev portal inventory pages --site /<site> --json` |
| Page inspection | `liferay_inventory_page` | `ldev portal inventory page --url <url> --json` |
| Structures | `liferay_inventory_structures` | `ldev portal inventory structures --site /<site> --json` |
| Templates | `liferay_inventory_templates` | `ldev portal inventory templates --site /<site> --json` |
| Deploy state | `liferay_deploy_status` | `ldev deploy status --json` |
| Bundle status | `liferay_osgi_status` | `ldev osgi status <bundle> --json` |
| Bundle diagnosis | `liferay_osgi_diag` | `ldev osgi diag <bundle> --json` |
| Thread dumps | `liferay_osgi_thread_dump` | `ldev osgi thread-dump --json` |
| Local diagnostics | `liferay_doctor` | `ldev doctor --json` |

`liferay_osgi_thread_dump` is diagnostic, but it writes dump artifacts under the
project's configured dump directory. Treat it as CLI-first when the user has not
asked for runtime artifacts or when workspace writes are restricted.

## What MCP Should Not Replace

Do not move these decisions into MCP tools:

- whether a task needs an isolated worktree
- whether a portal resource change is safe as a direct import or needs a migration
- whether a broad deploy or plural resource import is acceptable
- whether destructive commands are allowed
- project-specific conventions, review process, and issue handling
- browser-visible verification criteria

Those belong in skills and project context.

## Mutating Workflows

MCP tools can eventually expose carefully bounded mutations, but the default
practice is CLI-first for mutation:

- `ldev resource import-*`
- `ldev resource migration-pipeline`
- `ldev deploy module`
- `ldev deploy theme`
- `ldev env ...`
- `ldev db ...`
- `ldev worktree ...`

The skills define the safe order: discovery, check-only, mutation, read-back
verification, logs/OSGi checks, and browser validation when needed.

## Diagnosing Missing MCP Tools

Use setup once per project/client:

```bash
ldev ai mcp-setup --target . --tool all
```

Then validate:

```bash
ldev mcp doctor --target . --tool all
```

If doctor passes but the editor still does not show tools, restart the editor or
AI assistant. If doctor fails, use the CLI fallbacks above while fixing the MCP
configuration.
