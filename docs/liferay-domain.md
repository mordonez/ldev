---
title: Liferay Domain
description: Understanding how ldev maps Liferay concepts like sites, pages, structures, and OSGi bundles into command logic.
---

# Liferay Domain — Internal Boundaries

This document records the target module structure and ownership rules for `src/features/liferay/` and `src/commands/liferay/`. Future refactors should land within this plan rather than ad hoc.

## Sub-domain layout

```
src/features/liferay/
├── inventory/          Portal state inspection (read-only API calls)
│   ├── liferay-inventory-shared.ts        Auth resolution, site lookup, paginated fetch helpers
│   ├── liferay-inventory-page*.ts         Page/layout inspection (URL resolution, fetch, assemble)
│   ├── liferay-inventory-sites.ts         Site listing
│   ├── liferay-inventory-pages.ts         Page listing
│   ├── liferay-inventory-structures.ts    Structure listing
│   └── liferay-inventory-templates.ts     Template listing
│
├── resource/           Content resource sync (read/write API calls + local FS)
│   ├── liferay-resource-shared.ts         Shared API call helpers (list, resolve)
│   ├── liferay-resource-sync-shared.ts    Shared HTTP helpers for sync flows (authed multipart/form)
│   ├── liferay-resource-paths.ts          Path resolution (config → file paths, site tokens)
│   ├── liferay-resource-sync-structure*.ts  Structure sync (diff, migration, utils, orchestrator)
│   ├── liferay-resource-sync-fragments.ts   Fragment sync
│   ├── liferay-resource-sync-template.ts    Template sync
│   ├── liferay-resource-sync-adt.ts         ADT sync
│   ├── liferay-resource-migration*.ts       Migration init and execution helpers
│   ├── liferay-resource-export-*.ts         Export flows (structure, template, fragment, ADT)
│   ├── liferay-resource-import-*.ts         Bulk import flows
│   ├── liferay-resource-get-*.ts            Single-item fetch flows
│   ├── liferay-resource-list-*.ts           Listing flows
│   └── liferay-resource-*-normalize.ts      Payload normalization
│
├── page-layout/        Page layout export/diff tooling
│   ├── liferay-layout-shared.ts           Shared layout types and helpers
│   ├── liferay-page-layout-export.ts      Layout export
│   └── liferay-page-layout-diff.ts        Layout diff
│
├── liferay-auth.ts     OAuth token inspection (not token acquisition — that is in core/http/auth.ts)
├── liferay-config.ts   Portal config inspection and validation
├── liferay-search.ts   Elasticsearch / portal search API
├── liferay-health.ts   Portal health check
├── liferay-audit.ts    Audit log inspection
└── liferay-theme-check.ts  Theme file validation
```

## Ownership rules

### `inventory/` — read-only portal state inspection
- No write operations.
- `liferay-inventory-shared.ts` owns: access token caching, site lookup by URL/id/slug, paginated fetch (`fetchAllPages`), and the `ResolvedSite` type that all inventory flows share.
- Each listing or page-inspection flow gets its own file. Do not add new inspection concerns to `shared`.

### `resource/` — content resource sync
- Read and write operations against Data Engine, Fragments, DDM Templates, ADTs.
- `liferay-resource-shared.ts`: low-level API list/resolve helpers that multiple sync flows share (fragment collections, structure by key, etc.). Not a dumping ground — if something is only used by one flow, it belongs in that flow's file.
- `liferay-resource-sync-shared.ts`: HTTP transport helpers for multipart/form POST calls used by sync flows. Keep transport logic here, domain logic in the individual sync files.
- `liferay-resource-paths.ts`: all path resolution logic (config → local file path). No API calls.
- Each sync flow (structure, template, fragment, ADT) owns its own orchestrator file plus focused support modules (`-diff`, `-migration`, `-utils`) when the orchestrator would exceed ~400 lines.

### `page-layout/` — layout export and diff
- Export and diff of Liferay page layouts. Separate from inventory (which reads live portal state) because this flow reads/writes local files as well.

### Root-level domain files
`liferay-auth.ts`, `liferay-config.ts`, `liferay-search.ts`, `liferay-health.ts`, `liferay-audit.ts`, `liferay-theme-check.ts` are narrowly-scoped and belong at the domain root rather than in a subdirectory — they do not share enough concerns with any sub-domain group to warrant subdirectory organization. Keep them there unless a sub-domain group of ≥3 related files emerges.

## core/ vs liferay/ placement rule

A helper belongs in `core/` when:
- It is **transport/protocol level** and has no Liferay-specific domain knowledge (e.g. HTTP client, OAuth client, retry logic, TCP port checks)
- It is used by **two or more unrelated feature domains** (e.g. env, deploy, liferay)

A helper belongs in `src/features/liferay/` when:
- It calls Liferay-specific API endpoints, or interprets Liferay-specific response shapes
- It is used only within the Liferay feature domain

Gray area: `liferay-inventory-shared.ts` currently owns the OAuth token fetch + site resolution that all Liferay flows share. These are Liferay-specific concerns (portal OAuth, site group ID lookup) so they stay in the inventory shared module rather than in `core/`.

## Split triggers

Apply the same split pattern used for `liferay-resource-sync-structure` when:
- A single file exceeds ~500 lines AND
- It mixes distinct concerns (e.g. payload transformation + migration execution + HTTP persistence)

The preferred split module names follow the pattern `<base>-diff`, `<base>-migration`, `<base>-utils`, `<base>-types` as seen in the structure sync family.

Do not split a focused single-concern file just because it is long (e.g. `liferay-resource-sync-fragments.ts` at ~800 lines is one coherent sync flow with private types — splitting it would add indirection without adding clarity).

## Current status (April 2026)

The domain has been significantly refactored as of this writing:
- `inventory/` page inspection split into url, fetch, assemble, and orchestrator modules
- `resource/` structure sync split into diff, migration, utils, and orchestrator modules
- `commands/liferay/liferay.command.ts` reduced to a 52-line thin orchestrator
- All command sub-registries use `createFormattedAction` or documented escape-hatch patterns

Remaining hotspots to watch:
- `liferay-resource-sync-fragments.ts` (~800 lines, single concern — acceptable for now)
- `liferay-inventory-shared.ts` (~340 lines — consider splitting auth token helpers from site resolution if a third use-site emerges)
