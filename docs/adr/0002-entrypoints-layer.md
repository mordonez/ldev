# ADR 0002 — Introduce `entrypoints/` layer for long-lived server processes

- **Status:** Accepted
- **Date:** 2026-05-13
- **Audience:** maintainers of `ldev`
- **Related:** [ADR 0001](./0001-monorepo-vs-single-package.md), [Layer Model](../architecture/layers.md)

## Context

`ldev` exposes three surfaces from a single package:

1. **CLI** — Commander-based, entry `src/index.ts`.
2. **MCP server** — stdio-based MCP server, entry `src/mcp-server.ts`.
3. **Dashboard** — HTTP server + Preact client, spawned by `ldev dashboard`.

The MCP server and Dashboard are long-lived server processes. Each bundles an HTTP or stdio server loop, has its own startup/shutdown lifecycle, and consumes many `features/` modules to expose their operations as network-accessible actions.

Until 2026-05 these two server processes lived inside `src/features/`:

```
src/features/
  dashboard/      ← HTTP server + Preact client + route handlers
  mcp-server/     ← stdio MCP server + tool handlers
  mcp/            ← Liferay MCP client probe (unrelated)
```

This placement caused three problems:

1. **Naming collision.** `features/mcp/` (the Liferay MCP client probe that *calls* an external MCP server) and `features/mcp-server/` (the MCP *server* that ldev runs) shared the `mcp` namespace, making it impossible to use directory names as a mental model.

2. **Wrong abstraction level.** `features/` is the layer for self-contained, reusable business-logic units (deploy, env, worktree, …). A server process is not a reusable feature — it is an *aggregator* that routes external requests to features. Placing it in `features/` implied parity with units that belong there.

3. **Layer model violation.** Both server directories imported from 8–9 sibling `features/` modules. This is correct behavior for a process that orchestrates features, but it looks like coupling when the process is a peer of the same layer.

## Decision

**Introduce a new top-level source layer, `src/entrypoints/`**, to house the code that owns a running process or network surface.

```
src/entrypoints/
  dashboard/      ← HTTP server, Preact client, route handlers
  mcp-server/     ← stdio MCP server, tool handlers, MCP protocol wiring
```

Rules for the `entrypoints/` layer:

- An entrypoint **imports from `features/`** freely (its job is to aggregate features into a surface).
- An entrypoint **does not import from another entrypoint** (surfaces are independent).
- `features/` and `core/` **must not import from `entrypoints/`** (strict downward dependency).
- An entrypoint is **not exported** by the package. It only lives in the two tree-shaken entry bundles (`src/index.ts`, `src/mcp-server.ts`).

## Drivers

- Expressing the correct mental model: "this is a process, not a feature" at the directory level.
- Resolving the `mcp` / `mcp-server` naming collision. After the move, `features/liferay-mcp/` is the Liferay probe and `entrypoints/mcp-server/` is the MCP server — no ambiguity.
- Enabling the ESLint rule (see ADR 0004) that prevents `features/` from importing `entrypoints/`.

## Alternatives considered

### Alternative A — Rename and keep in `features/`

Rename `features/mcp/` → `features/liferay-mcp/` and `features/mcp-server/` → something else. Still in `features/`.

**Verdict:** rejected. Fixes the naming collision but not the conceptual mismatch. `features/dashboard/` still looks like a peer of `features/env/` when it is categorically different.

### Alternative B — Move to `src/servers/`

Same idea, different name.

**Verdict:** not materially different from `entrypoints/`. `entrypoints/` is preferred because it aligns with the mental model of "these are binary entrypoints" and maps to the two `tsdown` entry files (`src/index.ts`, `src/mcp-server.ts`).

### Alternative C — Promote to separate packages

See ADR 0001. Rejected for the same reasons: cost exceeds benefit at current project scale.

## Consequences

### Positive

- Directory names now describe the correct abstraction: `entrypoints/` is where process-owning code lives.
- Naming collision is eliminated.
- The layer diagram in `docs/architecture/layers.md` is complete: `cli → commands → entrypoints → features → core`.
- ESLint can enforce the `features/` ↛ `entrypoints/` rule unambiguously.

### Negative

- One-time file-move churn (47 files in dashboard, 21 in mcp-server). Completed in 2026-05 audit.
- Import paths in files that consumed `features/dashboard/` or `features/mcp-server/` had to be updated.

### Neutral

- Bundle output is unchanged. `tsdown` tree-shakes per entry; the directory of the source file is irrelevant to what ends up in `dist/`.
