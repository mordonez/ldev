# ADR 0003 — Zod schemas in `core/contracts/` as the source of truth for tool outputs

- **Status:** Accepted
- **Date:** 2026-05-13
- **Audience:** maintainers of `ldev`, AI agent consumers
- **Related:** [Contracts Guide](../architecture/contracts.md), [ADR 0001](./0001-monorepo-vs-single-package.md)

## Context

`ldev` exposes two machine-facing surfaces:

1. **MCP tools** — structured tools called by AI agents (Claude Code, Cursor, VS Code). Each tool returns a JSON blob that the agent parses to produce its next action.
2. **Dashboard HTTP API** — a set of JSON routes consumed by the Preact dashboard client and potentially by CI scripts or external agents.

Until 2026-05 the shape of these outputs existed only as TypeScript types inferred from the functions that produced them. There was no single, explicit document of what a tool *promises* to return.

This created three risks:

1. **Silent breaking changes.** Renaming a field, adding a discriminated union, or restructuring a nested object would change what agents receive with no indication in the tooling that the public contract changed.
2. **Duplicate schema knowledge.** Any consumer that wanted to validate or typecheck tool output had to re-derive the shape from reading source code. For AI agents this is impractical — they rely on schema documentation embedded in the tool description.
3. **No runtime validation.** The TypeScript types were compile-time only. A bug in a tool (e.g., returning `undefined` where a `string` was promised) would propagate silently to the agent.

## Decision

**Publish explicit Zod schemas for all MCP tool outputs and Dashboard API responses, located in `src/core/contracts/`.**

```
src/core/contracts/
  environment.schema.ts   ← ldev_context, ldev_status, ldev_logs_diagnose
  health.schema.ts        ← liferay_check, liferay_doctor, liferay_mcp_check
  deploy.schema.ts        ← liferay_deploy_status
  osgi.schema.ts          ← liferay_osgi_status, liferay_osgi_diag, liferay_osgi_thread_dump
  dashboard.schema.ts     ← task, worktree, status, log, maintenance routes
  index.ts                ← re-exports everything; single import point for consumers
```

Schemas live in `core/` because:

- `core/` is the lowest layer — available to all other layers without creating a dependency cycle.
- The contract is not an implementation detail of any one feature; it is a shared agreement between the producer (feature) and the consumer (agent / dashboard client).
- Placing them in a specific `features/` module would imply they belong to that feature rather than being a cross-cutting contract.

Rules:

1. **Schemas are the source of truth.** TypeScript types for tool outputs are derived from schemas via `z.infer<>`, not the other way around.
2. **MCP tool outputs are validated against the schema at the server boundary before returning to the client.** The current implementation attaches schemas through `TOOL_CATALOG` and validates in `mcp-server.ts`.
3. **Schemas are versioned by date.** A breaking change creates a new schema and a new ADR superseding this one for that tool, or adds a discriminated union variant.
4. **Schema fields are `camelCase`, not `snake_case`.** Zod produces the JSON; MCP tool names use `snake_case` because that is the MCP protocol convention, but the payload uses `camelCase` consistently.

## Drivers

- AI agents need stable, documented contracts. An implicit TypeScript type is not documentation.
- The Zod schema doubles as runtime validation (can be used in integration tests to assert real tool output matches the schema) and as documentation (`.describe()` annotations can be extracted into tool descriptions).
- `core/` placement avoids any future dependency cycle: features can import from core/contracts to validate what they return, but core/contracts imports only from Zod.

## Alternatives considered

### Alternative A — Types only, no Zod

Continue with inferred TypeScript types. Cheap, but provides no runtime validation and no documentation for non-TypeScript consumers.

**Verdict:** rejected. The risk of silent contract drift is too high given the reliance of Claude Code and Cursor on these tools.

### Alternative B — JSON Schema files (`.json`)

Generate JSON Schema from TypeScript types via `ts-json-schema-generator`. Standard for OpenAPI / MCP tool schemas.

**Pros:** JSON Schema is directly embeddable in MCP tool `inputSchema`.
**Cons:** the generated schemas are verbose and diverge from the TypeScript types over time if regeneration is not automated. Harder to co-locate with the implementation. No runtime validation without an additional library.

**Verdict:** rejected for now. Revisit if an MCP client requires a standalone JSON Schema file. Zod schemas can generate JSON Schema on demand via `zod-to-json-schema`.

### Alternative C — Schemas co-located with each feature

Put `environment.schema.ts` in `features/env/`, `health.schema.ts` in `features/liferay/`, etc.

**Pros:** closer to the code that produces the output.
**Cons:** breaks the `core/` availability guarantee — `core/contracts/` can be imported by all layers; `features/env/contracts.ts` cannot be imported from `core/`. Dashboard and MCP server would have to import from multiple feature directories to get all their contracts.

**Verdict:** rejected. The aggregation benefit of `core/contracts/` outweighs the co-location benefit.

## Consequences

### Positive

- Every tool's output is documented in one place, independent of implementation.
- Runtime validation catches bugs before they reach the agent.
- `src/core/contracts/index.ts` is a single import for any consumer that needs multiple schemas.
- Zod's `.describe()` annotations can be extracted to populate MCP tool descriptions automatically in a future iteration.

### Negative

- Schema and implementation can drift if maintainers update the implementation but forget to update the schema. Mitigated by integration tests that parse real tool output through the schema.
- Adding Zod as a `core/` dependency means it is bundled into both `dist/index.js` and `dist/mcp-server.js`. Current bundle size impact: negligible (Zod is already a dependency of other features).

### Neutral

- This ADR applies to *output* schemas only. Input validation for MCP tools (already defined via `inputSchema` in the MCP protocol) is separate and not in scope.
