# ldev — Binary Organization

This document covers the current binary layout, packaging rules, dependency constraints, and guidance for when (and when not) to add a new binary. The target audience is a contributor thinking about how `ldev` is distributed and what can safely go into each compiled artifact.

---

## Current Binaries

`ldev` ships exactly two binaries from a single npm package (`@mordonezdev/ldev`):

| Binary name | npm bin entry | Source entrypoint | Description |
|-------------|--------------|-------------------|-------------|
| `ldev` | `./dist/index.js` | `src/index.ts` | Commander CLI |
| `ldev-mcp-server` | `./dist/mcp-server.js` | `src/mcp-server.ts` | MCP stdio server |

Both are built from the same source tree by `tsdown` into the `dist/` directory:

```
package.json:
  "bin": {
    "ldev": "./dist/index.js",
    "ldev-mcp-server": "./dist/mcp-server.js"
  }
```

Build configuration (`tsdown.config.ts`):

```typescript
import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/mcp-server.ts'],
  format: ['esm'],
  platform: 'node',
  clean: true,
  sourcemap: true,
  dts: true,
  outDir: 'dist',
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
});
```

Both binaries are ESM modules requiring Node.js 22+.

---

## Binary 1: `ldev` → `dist/index.js`

### What it is

The Commander CLI. The only binary that exposes ldev's functionality interactively to a human operator. It supports all commands in the `src/commands/` layer and is the primary surface for daily development workflows.

### Source path

`src/index.ts` → delegates to `src/cli/create-cli.ts` → assembles Commander program from `COMMAND_GROUPS`.

### What is bundled

- All of `src/cli/` (Commander wiring)
- All of `src/commands/` (subcommand registrations)
- All of `src/features/` (business logic)
- All of `src/core/` (shared abstractions)
- `commander` (Commander.js)
- `@modelcontextprotocol/sdk` **client** imports — acceptable because `ldev mcp doctor` and `ldev mcp probe` are MCP _clients_ that talk to Liferay's MCP endpoint. The SDK client code in `dist/index.js` is intentional.
- Dashboard HTTP server code is **lazy-loaded** via the `ldev dashboard` subcommand. The dashboard's runtime deps (e.g., `hono` overrides) are only imported when the command executes.

### What must NOT be bundled

- `@modelcontextprotocol/sdk` **server/** imports (those belong in `dist/mcp-server.js`)
- Any import that starts `./entrypoints/mcp-server/mcp-server` or similar

### Validation

```bash
# CI verification that the CLI binary works:
node dist/index.js --help
node dist/index.js doctor --json || true
```

---

## Binary 2: `ldev-mcp-server` → `dist/mcp-server.js`

### What it is

A standalone stdio MCP server. AI agents (Claude Desktop, VS Code, Cursor, etc.) launch it as a subprocess and communicate via the Model Context Protocol. It exposes ldev's Liferay introspection capabilities as MCP tools.

### Source path

`src/mcp-server.ts` → delegates to `src/entrypoints/mcp-server/mcp-server.ts` → registers all tools from `ALL_TOOLS` and connects `StdioServerTransport`.

### What is bundled

- All of `src/entrypoints/mcp-server/` (MCP server lifecycle and tool registry)
- All `src/features/` modules reachable from MCP tools
- All of `src/core/` (shared abstractions)
- `@modelcontextprotocol/sdk` **server** imports (`McpServer`, `StdioServerTransport`, `CallToolResult`)
- `zod` (for tool input schemas)

### What must NOT be bundled

- `commander` — Commander must never appear in `dist/mcp-server.js`. The MCP server has its own `--help` and `--version` implemented with plain `process.argv` checks, not Commander.
- Any import from `src/cli/` or `src/commands/`

### Enforcement

An ESLint rule (`no-restricted-imports`) prevents `src/entrypoints/mcp-server/` and `src/features/mcp-server/` from importing `commander` or anything from `src/cli/`. If you introduce such an import, the lint step fails.

### Why no Commander in the MCP server

The MCP server is launched by an AI agent host, not a human typing in a terminal. It does not need subcommands, option parsing, or contextual help. Commander adds ~50kB and a non-trivial startup overhead that provides no value in the stdio server context. More importantly, Commander introduces complexity that could accidentally bleed CLI-surface assumptions (e.g., process.exit on unknown options) into the MCP server's lifecycle.

---

## Dashboard: Subcommand vs Standalone Binary

The dashboard is currently invoked as `ldev dashboard --port 4242`. It is **not** a separate binary.

### Current approach

`src/commands/dashboard/dashboard.command.ts` starts `createDashboardServer()` from `src/entrypoints/dashboard/dashboard-server.ts`. The HTTP server runs in the same Node.js process as the CLI, and the process stays alive via `await new Promise<never>(() => {})`.

The dashboard client (Preact SPA) is built separately by Vite (`npm run build:dashboard`) into `dist/dashboard-client/` and served as static assets by the dashboard HTTP server.

### Recommendation: keep as subcommand

Do **not** add a standalone `ldev-dashboard` binary at this time. Reasons:

1. The dashboard is a local development aid, not a standalone product. It has no independent installation path — users always install `ldev` first.
2. Adding a third binary would complicate the npm install (`postinstall` scripts, extra shebang files) for a surface with a small active user base.
3. The lazy-loading of dashboard deps already prevents dashboard HTTP server code from bloating `dist/index.js` for users who never invoke `ldev dashboard`.

**Revisit** when any of these conditions is true:
- The dashboard needs independent versioning or release cadence
- The dashboard is distributed to users who do not have the CLI (e.g., as a web service)
- The dashboard's startup time becomes problematic from within the CLI process

### Dashboard HTTP server dependencies

Dashboard server dependencies (e.g., `hono`, HTTP routing, SSE plumbing) are only imported at runtime when `ldev dashboard` is executed. The `dashboard.command.ts` file imports `createDashboardServer` at the top level, which means the dashboard code _is_ bundled into `dist/index.js`, but it is only _executed_ on demand. If startup time for `ldev doctor` or similar becomes measurably impacted by dashboard bundling, migrate to a dynamic import.

---

## Agentic Installer: `ldev ai install`

The agentic installer (`ldev ai install`) configures AI coding assistants to use ldev's MCP server. It lives in `src/commands/ai/` and `src/features/ai/`.

**Keep as a CLI subcommand.** Rationale:
- It is a one-shot setup operation, not a long-running server
- It requires `ldev` to be installed first (it writes configuration files that reference the `ldev-mcp-server` binary path)
- There is no scenario where it would be invoked independently of the CLI

---

## Naming Convention

Both binaries use the `ldev-` prefix:

| Binary | Description |
|--------|-------------|
| `ldev` | Primary CLI (short name because it is the most-typed command) |
| `ldev-mcp-server` | MCP stdio server (`ldev-mcp` was considered but is ambiguous — ldev has MCP _client_ features too) |

**If a third binary is ever added, it must use the `ldev-` prefix.** This keeps npm bin entries consistent and avoids collisions in `PATH`.

The name `ldev-mcp-server` is preferred over `ldev-mcp` because:
- `ldev mcp` (the CLI subcommand) is an MCP _client_ that probes Liferay's MCP endpoint
- `ldev-mcp-server` is ldev's own MCP _server_
- The `-server` suffix makes the distinction unambiguous in npm bin listings, process lists, and AI agent configuration

---

## Shared Config Between Binaries

Both binaries resolve configuration the same way:

```typescript
import {resolveProjectContext} from './core/config/project-context.js';

const {config, cwd} = resolveProjectContext();
```

`resolveProjectContext()` reads from:
1. The current working directory (or `REPO_ROOT` env var)
2. `docker/.env` (Docker Compose environment file)
3. `.liferay-cli.yml` / `.liferay-cli.local.yml` (Liferay profile files)

There is **no global singleton**. Each binary call to `resolveProjectContext()` produces an independent `AppConfig`. This means:
- The CLI and the MCP server can be started from different directories and will resolve different configs — intentional.
- The MCP server resolves config from the directory the AI agent host launches it from. AI agents must set the working directory to the project root.

`AppConfig` is defined in `src/core/config/schema.ts` and is the typed contract between config loading and all consumers. See [layers.md](./layers.md) for the full config story.

---

## When to Add a New npm bin Entry

Add a new `bin` entry only when a surface meets all of the following:

1. **It has an independent distribution path.** Users may install it without installing the other binaries.
2. **It has a distinct process lifecycle.** It is not a subcommand that starts and exits with the parent process.
3. **Its dependency set is meaningfully different.** Bundling it separately avoids inflating the other binaries with irrelevant code.

Current assessment:

| Surface | Independent dist? | Distinct lifecycle? | Different deps? | Add binary? |
|---------|------------------|---------------------|-----------------|-------------|
| `ldev-mcp-server` | Yes (AI agents launch it independently) | Yes (long-running stdio process) | Yes (no Commander) | **Yes — already done** |
| Dashboard | No | Yes | Partial | **No — keep as subcommand** |
| `ldev ai install` | No | No | No | **No — keep as subcommand** |

---

## Build and Packaging Checklist

When making changes that affect the binary boundary:

- [ ] Run `npm run build` and verify both `dist/index.js` and `dist/mcp-server.js` are produced
- [ ] Run `node dist/index.js --help` — must print ldev help without errors
- [ ] Run `node dist/mcp-server.js --version` — must print the package version
- [ ] Run `node dist/index.js doctor --json || true` — must parse as JSON (CI gate)
- [ ] Run `npm run verify:package` — verifies the npm pack output contains expected files
- [ ] If you added a new dependency that is only needed by one binary, confirm it does not appear in the other binary's bundle by inspecting the tsdown output or running a bundle analysis

### Bundle analysis reference

From the May 2026 bundle analysis (`docs/architecture/bundle-analysis-2026-05.md`):

| Output | Size (gzip) | Primary contributors |
|--------|-------------|---------------------|
| `dist/index.js` | ~350kB | `commander`, `zod`, `jszip`, feature modules |
| `dist/mcp-server.js` | ~180kB | `@modelcontextprotocol/sdk`, `zod`, feature modules |

If either binary grows by more than 20% without a known cause, investigate before merging.
