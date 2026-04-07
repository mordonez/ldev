# ldev

Agentic CLI for [Liferay](https://www.liferay.com) local development.

`ldev` is built for the parts of local Liferay development that are usually awkward: Java-heavy runtime setup, portal auth, [OSGi](https://www.osgi.org)/runtime diagnostics, deploy loops, and repo-backed content workflows. It does not try to be a universal environment manager — its goal is to make Liferay local work predictable.

## Project types

`ldev` enhances both standard Liferay Workspace setups and Docker-based projects:

- **`blade-workspace`** — the recommended path. Standard Liferay Workspace created with Blade. `ldev` adds diagnostics, runtime shortcuts, portal workflows, and agent context on top of the standard setup.
- **`ldev-native`** — advanced option. Uses `docker/` + `liferay/` layout with Docker Compose. For teams relying on Compose overlays, worktrees, snapshots, and advanced runtime patterns.

See [Support Matrix](/support-matrix) for Docker provider and platform support.

## What ldev is not

- not a generic environment manager for every stack
- not a stable public plugin platform
- not a replacement for Gradle or every Liferay admin workflow

## Key capabilities

| Capability | Command | Level |
| --- | --- | --- |
| Diagnostics that understand Liferay | `doctor` | Core |
| Stable repo/runtime snapshot for agents | `context` | Core |
| Portal context discovery (sites, pages, full page snapshot) | `portal inventory` | Core |
| Portal-aware resource sync | `resource` | Advanced |
| Project bootstrap | `project` | Core |
| Deploy and watch loops | `deploy` | Advanced |
| Isolated worktree environments | `worktree` | Advanced |
| AI agent integration | `ai install` | Advanced |
| Machine-readable output contract | `--json` / `--ndjson` | Core |

See [Key Capabilities](/capabilities) for detailed descriptions with runnable examples.

## Quick Start

```bash
npm install -g @mordonezdev/ldev
blade init ai-workspace
cd ai-workspace
ldev doctor
ldev start
ldev deploy all
```

Detailed path: [Install](/install) → [Quickstart](/quickstart) → [First Run Walkthrough](/first-run-walkthrough)

## New here?

Follow this path:

1. [Install](/install) — requirements and installation
2. [Quickstart](/quickstart) — minimal path to a working environment
3. [First Run Walkthrough](/first-run-walkthrough) — realistic end-to-end run with expected output
4. [Commands](/commands) — full reference with fast navigation

## Daily commands

- [`ldev doctor`](/commands)
- [`ldev context`](/commands)
- [`ldev start`](/commands)
- [`ldev oauth install`](/commands)
- [`ldev portal check`](/commands)
- [`ldev portal inventory page`](/commands)
- [`ldev logs diagnose`](/commands)

## Guides

| Guide | When to use |
|---|---|
| [Key Capabilities](/capabilities) | Understand what ldev can do |
| [Portal Inventory](/portal-inventory) | Deep dive into site/page discovery |
| [OAuth2 Scopes](/oauth-scopes) | Scope profiles and override instructions |
| [Resource Migration Pipeline](/resource-migration-pipeline) | End-to-end structure migration |
| [Worktree Environments](/worktree-environments) | Isolated branch environments |
| [Automation](/automation) | Machine-readable output contract |
| [AI Integration](/ai-integration) | Agent integration patterns |
| [AI Integration](/ai-integration) | `ldev ai install` usage and agent workflows |
| [MCP Strategy](/mcp-strategy) | When to use ldev vs MCP |
| [MCP Capability Matrix](/mcp-liferay-capability-matrix) | Runtime-validated MCP capability table |
| [Support Matrix](/support-matrix) | Platform and Docker provider support |
| [Upgrading](/upgrading) | CLI upgrade and scaffold-refresh guide |
| [Troubleshooting](/troubleshooting) | Common failures and fixes |
| [FAQ](/faq) | Frequently asked questions |

## Reference

- [Commands](/commands) — full CLI reference
- [Configuration](/configuration) — env vars and config files
- [API Surfaces](/api-surfaces) — Headless, MCP, JSONWS surfaces
- [Architecture](/architecture) — internal design and ownership
- [Contributing](/contributing) — development workflow
- [Releasing](/releasing) — release flow and checklist

## Links

- [GitHub Repository](https://github.com/mordonez/ldev)
- [npm Package](https://www.npmjs.com/package/@mordonezdev/ldev)
- [GitHub Releases](https://github.com/mordonez/ldev/releases)
