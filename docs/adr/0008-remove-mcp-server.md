# ADR 0008 — Remove the ldev MCP server

- **Status:** Accepted
- **Date:** 2026-06-18
- **Amends:** [ADR 0002](./0002-entrypoints-layer.md)

`ldev` is a CLI-first tool. The MCP server (`src/entrypoints/mcp-server/`, `src/mcp-server.ts`, `ldev-mcp-server` binary) has been removed. The CLI with `--json`/`--ndjson` output plus installed Claude Code skills is the supported agent integration path.

## Reasons

**stdio makes no sense for a CLI.** An MCP server connected over stdio is a long-lived process that an editor spawns and keeps alive. `ldev` is a command-line tool designed to be invoked and exit. The stdio transport creates an impedance mismatch with the tool's operational model.

**Context efficiency degrades.** An MCP server loads all tool schemas into the agent context on every session, regardless of the task. CLI invocations are on-demand and scoped to the operation at hand. Skills provide the same structured guidance without the fixed context cost.

**Local security model is redundant.** The MCP server was designed to run in each user's local environment. The CLI already runs in that same environment. A separate server process adds attack surface without adding isolation.

**cli+skills covers the same use cases better.** Agent workflows that previously relied on MCP tools (`liferay_inventory_sites`, `ldev_ai_bootstrap`, etc.) are fully covered by `ldev --json` output and the skills installed by `ldev ai install`. Skills express intent and workflow context that raw tool schemas cannot express.

## References

- [MCP vs CLI — Scalekit](https://www.scalekit.com/blog/mcp-vs-cli-use) — argues that MCP is the right transport when you need model-initiated tool calls at runtime, but CLI remains superior for scripted, auditable, human-reviewable workflows. `ldev` is squarely in the latter category.
- [MCP vs CLI — Firecrawl](https://www.firecrawl.dev/blog/mcp-vs-cli) — contrasts the two integration styles and notes that CLI+structured output is the better fit when the primary consumers are humans and CI pipelines, with agent access as a secondary concern.

Both sources reinforce the same conclusion: MCP adds value when the agent needs to discover and invoke arbitrary capabilities dynamically. `ldev`'s surface is intentional and bounded — skills express that surface more efficiently than runtime tool schemas.

## Consequences

- `entrypoints/` layer now has a single entry: `dashboard/`. The layer concept remains valid — the dashboard is still a long-lived server process, not a feature. See ADR 0002.
- `ldev mcp check/probe/openapis` (Liferay portal MCP probe) survive as `ldev portal mcp` subcommands. They are unrelated to ldev's own server role.
- `core/contracts/` schemas are retained as the contract layer for structured CLI output (`--json`) and dashboard API routes. The description "MCP tool outputs" no longer applies.
- `ldev mcp doctor` and the `ldev mcp` command namespace are removed entirely.
- Dashboard MCP status and `/api/mcp/doctor` route are removed.
- Agent guidance in `AGENTS.md` and `AGENTS.workspace.md` is rewritten around CLI + skills. All MCP references removed.
