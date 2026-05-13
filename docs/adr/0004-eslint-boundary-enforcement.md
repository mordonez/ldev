# ADR 0004 — Enforce architectural boundaries with ESLint, not package walls

- **Status:** Accepted
- **Date:** 2026-05-13
- **Audience:** maintainers of `ldev`
- **Related:** [ADR 0001](./0001-monorepo-vs-single-package.md), [ADR 0002](./0002-entrypoints-layer.md), [Layer Model](../architecture/layers.md)

## Context

`ldev`'s architecture relies on a strict layer order:

```
cli/ → commands/ → [entrypoints/] → features/ → core/
```

Dependencies must only flow downward. A violation — for example, `core/` importing from `features/`, or `commands/` importing directly from `features/` — breaks the promise that the lower layers are reusable without pulling in higher-layer code.

Until 2026-05 these rules existed only as prose in `CONTRIBUTING.md`. There was no automated enforcement: a PR that violated a boundary would pass CI as long as TypeScript type-checked and tests passed.

Two concrete violations existed on `main` before the 2026-05 audit:

1. `src/core/runtime/ldev-native-runtime-adapter.ts` imported from `features/env/` (core → features).
2. `src/commands/mcp/mcp.command.ts` imported directly from `features/mcp-server/` (commands → features, bypassing the entrypoints layer).

Both were introduced incrementally, without any tooling to flag them.

## Decision

**Encode layer boundaries as ESLint `no-restricted-imports` rules in `eslint.config.js`.** Violations fail `npm run lint`, which is required by the pre-push hook and CI.

Two rule sets are added:

### 1. `cliLayerImportPatterns` — applied to `src/cli/**` and `src/commands/**`

Prevents CLI and command modules from importing directly from `features/` or `entrypoints/`. Commands may only call the public API of a feature via a command handler that lives in `commands/`.

```js
// eslint.config.js (simplified)
{
  files: ['src/cli/**/*.ts', 'src/commands/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: cliLayerImportPatterns,  // blocks ../features/**, ../entrypoints/**
    }],
  },
}
```

### 2. `corePurityImportPatterns` — applied to `src/core/**`

Prevents core modules from importing from `features/` or `entrypoints/`. Core must be fully self-contained.

```js
{
  files: ['src/core/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: corePurityImportPatterns,  // blocks ../features/**, ../entrypoints/**
    }],
  },
}
```

Both rule sets use glob patterns so they catch both relative paths (`../../features/`) and any accidental absolute-style imports.

## Drivers

- **ADR 0001** decided to stay single-package and use lint instead of packages. This ADR is the concrete implementation of that decision — it is the "cheaper vehicle" referenced in ADR 0001 §4.
- A rule in `CONTRIBUTING.md` that has no automated check is not a rule — it is a suggestion. Two real violations on `main` proved this.
- ESLint runs in milliseconds and is already in the toolchain. There is no marginal cost to adding rules.

## Alternatives considered

### Alternative A — `dependency-cruiser`

A dedicated dependency-analysis tool that can enforce directed-graph rules (`no path from A to B`). More expressive than `no-restricted-imports` for complex graphs.

**Pros:** can express "no cycle in the entire graph" as a single rule.
**Cons:** requires a separate config file (`dependency-cruiser.json`) and a separate CI step. Adds a dev dependency that most contributors will not know. Overkill for a four-layer linear hierarchy.

**Verdict:** rejected for now. Prefer when the layer graph becomes a DAG rather than a strict total order.

### Alternative B — Package walls (same as ADR 0001 Alternative A)

Put `core/` in a separate package. Any import from a higher-level package to `core/` that violates the direction is a build error.

**Pros:** strongest enforcement.
**Cons:** see ADR 0001. The tax is not justified at current scale.

**Verdict:** rejected. See ADR 0001.

### Alternative C — Prose-only rules (status quo before 2026-05)

Document the layer rules in `CONTRIBUTING.md` and rely on code review.

**Verdict:** rejected. Demonstrated to be insufficient — two violations shipped to `main` and were not caught in review.

### Alternative D — Custom ESLint plugin

Write a project-specific ESLint plugin that understands the layer graph semantically.

**Pros:** can give better error messages ("you are in `core/`; importing from `features/` violates the layer model").
**Cons:** requires authoring and maintaining a plugin. `no-restricted-imports` with pattern messages already surfaces the violation clearly enough.

**Verdict:** rejected unless the number of rules grows beyond what `no-restricted-imports` can express cleanly.

## Consequences

### Positive

- Boundary violations fail CI immediately, before any human review.
- The rules are co-located with the rest of ESLint config, not in a separate tool.
- Existing violations were caught and fixed as part of adding the rules (2026-05 audit).
- New contributors get a clear error message when they accidentally violate a boundary.

### Negative

- `eslint.config.js` grows. Mitigated by isolating the rule arrays (`cliLayerImportPatterns`, `corePurityImportPatterns`) as named constants.
- `no-restricted-imports` matches on import path strings, not on semantic module identity. An import like `import x from '../../../../features/env/env.js'` matches; a re-export that wraps `features/` without a direct import would not. This is acceptable: the layer rules are about direct imports.
- A developer can bypass the rule with `--no-verify`. This is an accepted risk given that the pre-push hook also runs in CI. A force-push without CI would require deliberate intent.

### Neutral

- The rules apply to source files only, not to test files. Tests may import from any layer (they are not part of the shipped artifact and they need to reach the implementation under test). This is a deliberate exception.
