# Architecture

Internal architecture notes and decisions for `ldev`. These pages are intentionally not part of the user-facing documentation site navigation — they are aimed at maintainers and reviewers.

## ADRs

ADRs (Architecture Decision Records) capture decisions whose reasoning is non-obvious from the code and that we do not want to re-litigate casually. Format follows a lightweight MADR variant.

- [ADR 0001 — Stay single-package; do not adopt a `packages/` monorepo (yet)](../adr/0001-monorepo-vs-single-package.md)
- [ADR 0002 — Introduce `entrypoints/` layer for long-lived server processes](../adr/0002-entrypoints-layer.md)
- [ADR 0003 — Zod schemas in `core/contracts/` as the source of truth for tool outputs](../adr/0003-zod-contracts-in-core.md)
- [ADR 0004 — Enforce architectural boundaries with ESLint, not package walls](../adr/0004-eslint-boundary-enforcement.md)
- [ADR 0005 — LiferayGateway as the single HTTP abstraction for all Liferay API calls](../adr/0005-liferay-gateway.md)
- [ADR 0006 — Domain error factories: typed, coded, and secret-sanitized throws](../adr/0006-domain-error-factories.md)
- [ADR 0007 — SyncEngine/SyncStrategy: typed strategy pattern for resource sync](../adr/0007-sync-engine-strategy.md)

## Conventions

- One ADR per decision. Number monotonically.
- Status: `Proposed` → `Accepted` → `Superseded by ADR-NNNN`.
- Never edit an accepted ADR. Write a new one that supersedes it.
- Audits and reports are kept locally, not in the repo (they are session artifacts).
