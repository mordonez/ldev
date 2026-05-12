# ADR 0001 — Stay single-package; do not adopt a `packages/` monorepo (yet)

- **Status:** Accepted (proposed)
- **Date:** 2026-05-12
- **Audience:** maintainers of `ldev`
- **Related:** [Architecture Audit 2026-05](../architecture/audit-2026-05.md)

## Context

`ldev` ships two binaries from a single npm package (`@mordonezdev/ldev`):

- `ldev` — the CLI (Commander-based, `src/index.ts`).
- `ldev-mcp-server` — an MCP server over stdio (`src/mcp-server.ts`).

It also exposes a Dashboard (HTTP server + Preact client) as a CLI subcommand (`ldev dashboard`), and an "AI install" / agentic installer surface.

The product is growing from "CLI" to "tool family". The question raised by the maintainer:

> Should we split `ldev` into a `packages/`-style monorepo (`packages/core`, `packages/cli`, `packages/mcp`, `packages/dashboard`, …) or keep the single-package layout?

This ADR records the decision and the reasoning, so we do not re-litigate it casually and so we have explicit re-evaluation triggers.

## Decision

**Stay single-package.** Do not introduce a workspaces / `packages/` monorepo at this time.

Achieve the *benefits* a monorepo would have given us — clear surface boundaries, prevented coupling, smaller per-binary bundles — through cheaper, in-repo techniques:

1. **Move entrypoints out of `features/`** into a top-level `src/entrypoints/` directory (dashboard, MCP server). This expresses surface boundaries at the directory level, not the package level.
2. **Enforce layer direction with lint, not packages.** Add `eslint-plugin-import` `no-restricted-imports` rules (or `dependency-cruiser`) for the rules already documented in `CONTRIBUTING.md`.
3. **Continue per-entry bundling with `tsdown`.** Tree-shaking and entry-based bundle splitting are the actual mechanism that keeps the MCP server bundle from carrying CLI-only deps. That mechanism is unchanged by a package split.
4. **Defer the question.** Re-open this ADR when one of the triggers below fires.

## Drivers

What the maintainer actually wants out of "monorepo or not":

- **Clear, enforced boundaries** between CLI / MCP / Dashboard / Core, so a contributor cannot accidentally import `commander` from an MCP tool.
- **Right-sized binaries**, so the MCP server does not load CLI-only deps and the CLI does not load HTTP server / Preact-tree code unless the dashboard subcommand is invoked.
- **Future-proofing**, in case one surface becomes a separate published product (e.g., `@mordonezdev/ldev-mcp`).
- **No tax for hypothetical futures.** The maintainer's prompt is explicit: no enterprise overkill.

## Why the answer is "not yet"

### 1. The boundaries we want already exist in the source layout

The audit confirms zero violations of the `cli → commands → features → core` direction. The two remaining smells (`dashboard/` and `mcp-server/` living inside `features/`, `features/mcp/` naming collision) are **directory-level** problems with **directory-level** fixes. A monorepo would not solve them faster; it would just impose a heavier vehicle.

### 2. Splitting into packages does not reduce coupling

`features/dashboard/` imports **9 sibling features**. `features/mcp-server/` imports **8 sibling features**. If we put each surface in its own package, every surface package would `import` (or `dependency:`) a `packages/core-features/` package that contains essentially the same code as today. The coupling is product-defined: the dashboard exposes operations across features. Re-shaped into packages, this becomes a dependency graph between packages with the same shape as the import graph between directories — but now with version mismatches, separate `tsconfig.json`s, and workspace tooling on top.

### 3. Splitting does not reduce per-binary bundle size

`tsdown` builds each `entry` from `src/` and tree-shakes per-entry. The MCP server bundle only contains what `src/mcp-server.ts` transitively imports. A package split would not change this — at best it would make the tree-shaking redundant by hand-curating dependency lists per package. If a future bundle audit shows leakage (e.g., `commander` ending up in `dist/mcp-server.js`), the fix is an import-graph fix, not a package boundary.

### 4. Independent versioning would be a downside, not an upside

`ldev` is a single product. Today's users expect the two binaries to move together. Independent versioning across packages introduces compatibility matrices (which version of `@ldev/cli` works with which version of `@ldev/core`?) that the project does not need. Even Changesets-style coordinated releases inside a workspace are more ceremony than `npm version + tsdown build`.

### 5. The dashboard CLIENT is the only real "different toolchain" case, and it already has one

The Preact client legitimately wants Vite, not tsdown. It already builds via `vite.dashboard.config.ts` into `dist/dashboard-client/`. That cross-toolchain split is already handled with config, not packages.

### 6. The single concrete cost is real and ongoing

A `packages/` split adds:

- A workspace tooling layer (`npm workspaces`, `pnpm`, or similar).
- N `tsconfig.json` files plus a root `tsconfig.references.json`.
- Cross-package import path indirection (`@ldev/core` vs `../../core`).
- A release coordination tool or convention (Changesets, etc.).
- CI matrix for per-package builds + per-package tests.
- Editor / LSP weirdness on path resolution.

That tax is paid every working day. The benefit ("clearer boundaries") is available for ~½ day of ESLint configuration today.

## Alternatives considered

### Alternative A — Full `packages/` workspace (4-5 packages)

```
packages/
├── core/         # config, http, contracts, output, platform, runtime
├── liferay/      # the liferay domain features
├── cli/          # commander wiring + commands
├── mcp/          # the MCP server entrypoint + tools
├── dashboard/    # HTTP server + Preact client
└── agentic/      # AI installer
```

**Pros:** strongest enforcement; ready for selective publishing.
**Cons:** see §6 above; the size of the project does not yet justify the tooling layer.
**Verdict:** rejected for now.

### Alternative B — Minimal split: `packages/core` + `packages/app`

A two-package split, where `core` is config / http / contracts / output / platform and `app` is everything else. Smaller tax than A.

**Pros:** clean publish boundary if `core` ever becomes independently consumed.
**Cons:** still imposes workspace tooling for one boundary that today is enforced by directory + lint. No external consumer of `core/` exists today.
**Verdict:** rejected for now. Promote to "active candidate" the moment a second consumer appears (see triggers).

### Alternative C — Single package, directories + lint (this ADR)

Stay where we are, fix the two real smells, encode the rules in ESLint.

**Pros:** lowest cost, highest ratio of benefit-to-disruption. Reversible. Compatible with B and A in the future.
**Cons:** less impressive on paper. Requires discipline (mitigated by lint).
**Verdict:** accepted.

### Alternative D — "Just delete the dashboard / split it into a separate repo"

The most radical de-coupling.

**Pros:** smallest CLI.
**Cons:** the dashboard is a product feature, not a separate product. Splitting repos turns one PR into two PRs forever after.
**Verdict:** rejected. Repo split is more expensive than monorepo split.

## Re-evaluation triggers

This ADR is provisional. Re-open it when **any one** of these is true:

1. A genuine external consumer of `core/` (or some subset) appears — for example, someone wanting `@ldev/contracts` as a published Zod schema package without the CLI.
2. The MCP server becomes a product on its own (separate marketing, separate distribution, separate release cadence from the CLI).
3. The dashboard becomes a hosted / SaaS product, separable from the local CLI.
4. The CLI cold-start time exceeds the maintainer's tolerance and a bundle audit proves the cause is unavoidable shared imports between entrypoints.
5. Contributor friction from layer-direction violations exceeds what lint rules can prevent.
6. The maintainer reaches v1.0 and wants to bake in a long-term packaging contract.

Until then, the cost of moving is higher than the cost of staying.

## Consequences

### Positive

- No new tooling layer.
- The audit's recommended PR sequence (rename `features/mcp/`, move dashboard + MCP server to `entrypoints/`, add lint rules) is fully compatible with this decision and remains useful.
- Decision is reversible. Single-package → `packages/` is a one-way refactor we can do later; the reverse is much harder.

### Negative

- Surface boundaries depend on directory discipline + lint, not on package walls. A contributor with `--no-verify` access could regress.
- "Independent versioning" is off the table without revisiting this ADR. If the MCP server starts moving on a different release cadence from the CLI, we will hit this.
- Selective publishing (`npm publish` just the contracts) is not possible without restructure. Today this is hypothetical; record it as a known limitation.

### Neutral

- The TypeScript build stays one big graph. That is fine on 85k LOC; it will not be fine forever, but "forever" is not "now".

## Implementation note

This ADR is metadata — it does not itself change code. It records the decision to **decline** a structural change. The follow-up work that *is* recommended (move entrypoints, rename, add lint) is captured in §11 of the audit document.
