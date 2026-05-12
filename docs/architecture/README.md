# Architecture

Internal architecture notes and decisions for `ldev`. These pages are intentionally not part of the user-facing documentation site navigation — they are aimed at maintainers and reviewers.

## Audits

- [2026-05 Architecture Audit](./audit-2026-05.md) — structural review of `src/`, surface boundaries, dependency direction, contracts, build/packaging, and naming.

## ADRs

ADRs (Architecture Decision Records) capture decisions whose reasoning is non-obvious from the code and that we do not want to re-litigate casually. Format follows a lightweight MADR variant.

- [ADR 0001 — Stay single-package; do not adopt a `packages/` monorepo (yet)](../adr/0001-monorepo-vs-single-package.md)

## Conventions

- One ADR per decision. Number monotonically.
- Status: `Proposed` → `Accepted` → `Superseded by ADR-NNNN`.
- Never edit an accepted ADR. Write a new one that supersedes it.
- Audits are dated (`YYYY-MM`). Do not delete old audits; they are history.
