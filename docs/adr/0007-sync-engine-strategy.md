# ADR 0007 — ImportEngine/ImportStrategy: a typed strategy pattern for Liferay resource sync

- **Status:** Accepted
- **Date:** 2026-05 (formalised; pattern established 2026-04)
- **Audience:** maintainers of `ldev`
- **Related:** [ADR 0005](./0005-liferay-gateway.md), [ADR 0006](./0006-domain-error-factories.md)

## Context

`ldev` synchronises several types of Liferay resources from local files to a remote portal: web content structures, templates (ADT), display page templates, fragments, fragment collections, and others. Each resource type has different:

- Local representation (JSON file, Freemarker template, ZIP, …).
- Remote API endpoint (headless delivery, JSON-WS, …).
- Identity keys (structure key, template key, external reference code, …).
- Upsert semantics (some can be created via POST, others require PUT on the key, some need a preliminary lookup).
- Verification step (after upsert, re-fetch and compare the hash to confirm the write landed).

Before 2026-04 (PRs #37–38, #60), each resource type had its own bespoke sync function with ad-hoc logic. The duplication led to inconsistent behaviour (some types verified the upsert, others did not; some surfaced errors as "skipped", others threw), and adding a new resource type required reimplementing the entire sync lifecycle from scratch.

## Decision

**Model resource synchronisation as a generic `ImportEngine<Local, Remote>` that runs a pluggable `ImportStrategy<Local, Remote>` for each resource type.**

### Interfaces (`src/features/liferay/resource/import-engine.ts`)

```ts
interface ImportStrategy<Local, Remote> {
  resolveLocal(): Promise<Local[]>;
  findRemote(local: Local): Promise<Remote | null>;
  upsert(local: Local, remote: Remote | null): Promise<Remote>;
  verify(local: Local, remote: Remote): Promise<boolean>;
  preview?(local: Local, remote: Remote | null): ImportPreview;
}

interface ImportEngine<Local, Remote> {
  run(strategy: ImportStrategy<Local, Remote>, options?: ImportEngineOptions): Promise<ImportEngineResult[]>;
}
```

### Engine responsibilities

The engine owns the loop logic common to all resource types:

1. **Resolve** — calls `strategy.resolveLocal()` to enumerate local artifacts.
2. **Find** — calls `strategy.findRemote(local)` for each, to know whether this is a create or update.
3. **Upsert** — calls `strategy.upsert(local, remote)` to write the change.
4. **Verify** — calls `strategy.verify(local, remote)` to confirm the write landed (hash check).
5. **Collect results** — aggregates created/updated/failed/skipped counts.
6. **Emit progress** — prints per-artifact status via an `OutputPrinter` passed at construction time.

### Strategy responsibilities

Each strategy (`fragmentEntryImportStrategy`, `templateImportStrategy`, `structureImportStrategy`, …) provides only the resource-type-specific logic for each step. Strategies are plain objects, not classes, created once per sync invocation.

### Preview mode

Strategies may optionally implement `preview(local, remote)` to return a diff summary without writing. The engine checks for its presence and runs in dry-run mode when `options.checkOnly === true`.

## Drivers

- Adding a new resource type required only implementing the 4 strategy methods, not reimplementing the loop.
- Verification (hash-based round-trip check) was inconsistently implemented before; now it is mandatory (missing `verify()` is a TypeScript error).
- Progress output and error collection are engine concerns, not strategy concerns — no more per-strategy "how do I print a progress bar" decisions.
- PRs #82 and #93 added unit tests for the engine independently of any strategy, which was not possible with bespoke sync functions.

## Alternatives considered

### Alternative A — One sync function per resource type (status quo before 2026-04)

Each resource type has its own `syncStructures()`, `syncTemplates()`, `syncFragments()`, etc.

**Verdict:** rejected. Demonstrated to produce inconsistent verification, inconsistent error handling, and large duplication. The bug where structure sync did not verify the upsert before reporting success was a concrete consequence.

### Alternative B — Class-based strategy with inheritance

`class StructureSyncStrategy extends BaseSyncStrategy<Structure, RemoteStructure>`.

**Pros:** method overriding is concise.
**Cons:** class inheritance for strategies introduces shared mutable state risks (if someone adds a field to the base class, all subclasses inherit it). Object/function composition is more explicit.

**Verdict:** rejected. Strategies as plain objects with typed methods are simpler and easier to test.

### Alternative C — Event-driven pipeline

Emit events (`onResolve`, `onUpsert`, …) and register handlers per resource type.

**Pros:** maximally decoupled.
**Cons:** significantly harder to type, trace, and test. The lifecycle is linear and well-understood; an event bus adds indirection without benefit.

**Verdict:** rejected.

## Consequences

### Positive

- Adding a new syncable resource type is a single `ImportStrategy<Local, Remote>` implementation — no engine changes needed.
- Verification is enforced by the TypeScript interface. A strategy without `verify()` does not compile.
- Engine tests (`import-engine.test.ts`) cover all lifecycle paths with mock strategies; individual strategy tests cover resource-type specifics.

### Negative

- The engine's generic type parameters (`Local`, `Remote`) propagate through test fixtures. Strategies for complex resources (structures with nested fields) require verbose type definitions.
- Preview mode (`preview()`) is optional, so not all strategies support it. Callers must check `supportsPreview` before requesting a dry run.

### Neutral

- The pattern applies only to the resource-sync domain. Other sync-like operations in `ldev` (env start/stop, worktree setup) are not using ImportEngine — they are simpler sequential flows that do not need the strategy abstraction.
