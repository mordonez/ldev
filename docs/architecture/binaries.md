# ldev — Binary Organization

This document covers the current binary layout, packaging rules, dependency constraints, and guidance for when (and when not) to add a new binary. The target audience is a contributor thinking about how `ldev` is distributed and what can safely go into each compiled artifact.

---

## Current Binaries

`ldev` ships one binary from a single npm package (`@mordonezdev/ldev`):

| Binary name | npm bin entry | Source entrypoint | Description |
|-------------|--------------|-------------------|-------------|
| `ldev` | `./dist/index.js` | `src/index.ts` | Commander CLI |

Built from the same source tree by `tsdown` into the `dist/` directory:

```
package.json:
  "bin": {
    "ldev": "./dist/index.js"
  }
```

Build configuration (`tsdown.config.ts`):

```typescript
import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  clean: true,
  sourcemap: true,
  dts: true,
  outDir: 'dist',
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
});
```

The binary is an ESM module requiring Node.js 22+.

---

## Binary: `ldev` → `dist/index.js`

### What it is

The Commander CLI. The only binary that exposes ldev's functionality interactively to a human operator or an agent skill. It supports all commands in the `src/commands/` layer and is the primary surface for all ldev workflows.

### Source path

`src/index.ts` → delegates to `src/cli/create-cli.ts` → assembles Commander program from `COMMAND_GROUPS`.

### What is bundled

- All of `src/cli/` (Commander wiring)
- All of `src/commands/` (subcommand registrations)
- All of `src/features/` (business logic)
- All of `src/core/` (shared abstractions)
- `commander` (Commander.js)
- `@modelcontextprotocol/sdk` **client** imports — acceptable because `ldev portal mcp check/probe/openapis` are MCP _clients_ that talk to Liferay's MCP endpoint. The SDK client code in `dist/index.js` is intentional.
- Dashboard HTTP server code is **lazy-loaded** via the `ldev dashboard` subcommand. The dashboard's runtime deps (e.g., `hono` overrides) are only imported when the command executes.

### What must NOT be bundled

- `@modelcontextprotocol/sdk` **server/** imports (ldev no longer ships an MCP server)
- Any import that starts `./entrypoints/mcp-server/` (removed in ADR 0008)

### Validation

```bash
# CI verification that the CLI binary works:
node dist/index.js --help
node dist/index.js doctor --json || true
```

---

## Dashboard: Subcommand vs Standalone Binary

The dashboard is currently invoked as `ldev dashboard --port 4242`. It is **not** a separate binary.

### Current approach

`src/commands/dashboard/dashboard.command.ts` starts `createDashboardServer()` from `src/entrypoints/dashboard/dashboard-server.ts`. The HTTP server runs in the same Node.js process as the CLI, and the process stays alive via `await new Promise<never>(() => {})`.

The dashboard client (Preact SPA) is built separately by Vite (`npm run build:dashboard`) into `dist/dashboard-client/` and served as static assets by the dashboard HTTP server.

### Recommendation: keep as subcommand

Do **not** add a standalone `ldev-dashboard` binary at this time. Reasons:

1. The dashboard is a local development aid, not a standalone product. It has no independent installation path — users always install `ldev` first.
2. Adding a second binary would complicate the npm install (`postinstall` scripts, extra shebang files) for a surface with a small active user base.
3. The lazy-loading of dashboard deps already prevents dashboard HTTP server code from bloating `dist/index.js` for users who never invoke `ldev dashboard`.

**Revisit** when any of these conditions is true:
- The dashboard needs independent versioning or release cadence
- The dashboard is distributed to users who do not have the CLI (e.g., as a web service)
- The dashboard's startup time becomes problematic from within the CLI process

### Dashboard HTTP server dependencies

Dashboard server dependencies (e.g., `hono`, HTTP routing, SSE plumbing) are only imported at runtime when `ldev dashboard` is executed. The `dashboard.command.ts` file imports `createDashboardServer` at the top level, which means the dashboard code _is_ bundled into `dist/index.js`, but it is only _executed_ on demand. If startup time for `ldev doctor` or similar becomes measurably impacted by dashboard bundling, migrate to a dynamic import.

---

## Agentic Installer: `ldev ai install`

The agentic installer (`ldev ai install`) configures AI coding assistants to use ldev's CLI + skills. It lives in `src/commands/ai/` and `src/features/ai/`.

**Keep as a CLI subcommand.** Rationale:
- It is a one-shot setup operation, not a long-running server
- It requires `ldev` to be installed first (it writes configuration files that reference ldev workflows)
- There is no scenario where it would be invoked independently of the CLI

---

## Naming Convention

The `ldev` binary uses no prefix — it is the most-typed command.

If a second binary is ever added, it must use the `ldev-` prefix. This keeps npm bin entries consistent and avoids collisions in `PATH`.

---

## Shared Config

The binary resolves configuration via:

```typescript
import {resolveProjectContext} from './core/config/project-context.js';

const {config, cwd} = resolveProjectContext();
```

`resolveProjectContext()` reads from:
1. The current working directory (or `REPO_ROOT` env var)
2. `docker/.env` (Docker Compose environment file)
3. `.liferay-cli.yml` / `.liferay-cli.local.yml` (Liferay profile files)

There is **no global singleton**. Each call to `resolveProjectContext()` produces an independent `AppConfig`. `AppConfig` is defined in `src/core/config/schema.ts` and is the typed contract between config loading and all consumers. See [layers.md](./layers.md) for the full config story.

---

## When to Add a New npm bin Entry

Add a new `bin` entry only when a surface meets all of the following:

1. **It has an independent distribution path.** Users may install it without installing the other binaries.
2. **It has a distinct process lifecycle.** It is not a subcommand that starts and exits with the parent process.
3. **Its dependency set is meaningfully different.** Bundling it separately avoids inflating the other binaries with irrelevant code.

Current assessment:

| Surface | Independent dist? | Distinct lifecycle? | Different deps? | Add binary? |
|---------|------------------|---------------------|-----------------|-------------|
| Dashboard | No | Yes | Partial | **No — keep as subcommand** |
| `ldev ai install` | No | No | No | **No — keep as subcommand** |

---

## Build and Packaging Checklist

When making changes that affect the binary boundary:

- [ ] Run `npm run build` and verify `dist/index.js` is produced
- [ ] Run `node dist/index.js --help` — must print ldev help without errors
- [ ] Run `node dist/index.js doctor --json || true` — must parse as JSON (CI gate)
- [ ] Run `npm run verify:package` — verifies the npm pack output contains expected files
- [ ] If you added a new dependency, confirm it does not bloat the bundle unexpectedly by inspecting the tsdown output

### Bundle analysis reference

From the May 2026 bundle analysis (`docs/architecture/bundle-analysis-2026-05.md`):

| Output | Size (gzip) | Primary contributors |
|--------|-------------|---------------------|
| `dist/index.js` | ~350kB | `commander`, `zod`, `jszip`, feature modules |

If the binary grows by more than 20% without a known cause, investigate before merging.
