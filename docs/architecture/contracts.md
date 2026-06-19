# ldev — Contract Guide

This document explains what contracts are in `ldev`, where they live, how to write them, and when they are required. The target audience is a contributor adding a new dashboard API route or CLI command with machine-readable output.

---

## Why Contracts Exist

`ldev` exposes its functionality through two surfaces:

1. **CLI** (`ldev <command>`) — human-readable text or `--json`/`--ndjson` for scripting
2. **Dashboard** (`ldev dashboard`) — a local web UI that calls an HTTP API

The CLI text output is intentionally informal: format it however serves the human reader. But the dashboard and documented `--json` outputs are **automation consumers**: they parse JSON programmatically, and they break silently when a field is renamed or its type changes.

Contracts solve this problem. A contract is a Zod schema that:
- Defines the exact shape of a JSON output consumed by automation
- Is the single source of truth for both the producer (feature function) and the consumers (dashboard route, external scripts)
- Makes breaking changes visible at the type level
- Can be used to validate actual API responses in tests

---

## Where Contracts Live

All contracts live under `src/core/contracts/`:

```
src/core/contracts/
├── index.ts            # Re-exports all public schemas and types
├── shared.schema.ts    # Schemas shared by multiple domains (site, page, company, etc.)
├── inventory.schema.ts # Inventory domain: sites, templates, structures, where-used
└── resource.schema.ts  # Resource domain: fragment sync, ADT sync, structure/template sync
```

This location is intentional: `core/` has no domain knowledge, so contracts can be imported by any layer — features, entrypoints, and tests — without introducing circular dependencies.

---

## What Is Already Contracted

### `shared.schema.ts`

Shared payloads used across domains:

| Schema | Type | Description |
|--------|------|-------------|
| `resolvedSiteSchema` | `ResolvedSite` | Normalised site: `id`, `friendlyUrlPath`, `name` |
| `siteLookupPayloadSchema` | `SiteLookupPayload` | Tolerant raw site API response |
| `headlessPageSchema<T>` | `HeadlessPage<T>` | Paginated Liferay Headless API wrapper |
| `headlessSiteSchema` | `HeadlessSite` | Tolerant headless-admin-site response |
| `dataDefinitionSchema` | `DataDefinition` | Data-engine content structure |
| `contentTemplateSchema` | `ContentTemplate` | Headless-delivery template |
| `jsonwsCompanySchema` | `JsonwsCompany` | JSONWS company response |
| `jsonwsGroupSearchResultSchema` | `JsonwsGroupSearchResult` | JSONWS group search (supports both `friendlyURL` and `friendlyUrl`) |

### `inventory.schema.ts`

Inventory domain contracts — used by inventory commands and the dashboard:

| Schema | Type | Description |
|--------|------|-------------|
| `liferayInventorySitesSchema` | `LiferayInventorySites` | Array of site entries with `groupId`, `siteFriendlyUrl`, `name`, `pagesCommand` |
| `liferayInventoryTemplatesSchema` | `LiferayInventoryTemplates` | Array of content templates |
| `liferayInventoryStructuresSchema` | `LiferayInventoryStructures` | Array of content structures |
| `whereUsedResultSchema` | `WhereUsedResultContract` | Full where-used scan result including sites, matches, and summary |
| `whereUsedPlanResultSchema` | `WhereUsedPlanResultContract` | Plan-only result (no page scanning, just site selection) |
| `whereUsedQuerySchema` | `WhereUsedQuery` | Input query: `{type, keys}` |
| `whereUsedMatchSchema` | `WhereUsedMatch` | A single resource match on a page |
| `whereUsedPageMatchSchema` | `WhereUsedPageMatch` | A page with its matches |

### `resource.schema.ts`

Resource sync contracts — used by resource commands and dashboard routes that report sync results:

| Schema | Type | Description |
|--------|------|-------------|
| `liferayResourceSyncFragmentsResultSchema` | `LiferayResourceSyncFragmentsResult` | Discriminated union: single-site or all-sites fragment sync result |
| `liferayResourceSyncFragmentItemResultSchema` | `LiferayResourceSyncFragmentItemResult` | Single fragment sync: `{collection, fragment, status, fragmentEntryId?, error?}` |
| `liferayResourceSyncAdtItemResultSchema` | `LiferayResourceSyncAdtItemResult` | ADT sync: `{widgetType, key, status, templateId?, error?}` |
| `liferayResourceSyncStructureItemResultSchema` | `LiferayResourceSyncStructureItemResult` | Structure sync: `{key, status, structureId?, error?}` |
| `liferayResourceSyncTemplateItemResultSchema` | `LiferayResourceSyncTemplateItemResult` | Template sync: `{key, structureKey, status, templateId?, error?}` |
| `liferayResourceImportFailureSchema` | `LiferayResourceImportFailure` | Failed import: `{key, error}` |

---

## How to Write a New Contract

### Step 1 — Define the schema in the appropriate schema file

Add your schema to `src/core/contracts/inventory.schema.ts`, `resource.schema.ts`, or a new `<domain>.schema.ts` file.

```typescript
// src/core/contracts/example.schema.ts
import {z} from 'zod';

/**
 * ExampleResult: result of running the example action.
 * Consumed by: dashboard /api/example, ldev example action --json
 */
export const exampleResultSchema = z.object({
  message: z.string(),
  count: z.number().int().nonnegative(),
  status: z.enum(['ok', 'error']),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      value: z.number().optional(),
    }),
  ),
});

export type ExampleResult = z.infer<typeof exampleResultSchema>;
```

Guidelines for schema design:
- Use `.optional()` on fields that may legitimately be absent — prefer it over `z.union([z.string(), z.undefined()])`.
- Mark internal-only schemas (used by one feature only, not by the dashboard or documented `--json` output) with a JSDoc comment saying "not a public contract."
- Use `z.enum([...] as const)` for string unions; export the const array alongside the schema for iteration.
- For Liferay API responses that may have alternate field names across versions, use `.optional()` on both variants (see `jsonwsGroupSearchResultSchema`'s `friendlyURL` / `friendlyUrl` pattern).

### Step 2 — Re-export from `index.ts`

Add the schema and its inferred type to `src/core/contracts/index.ts`:

```typescript
// In src/core/contracts/index.ts
export {exampleResultSchema} from './example.schema.js';
export type {ExampleResult} from './example.schema.js';
```

### Step 3 — Use the type in the feature function

The feature function's return type should align with the contract type. You can use `z.infer` directly or re-use the exported type:

```typescript
// src/features/example/example-action.ts
import type {ExampleResult} from '../../core/contracts/index.js';

export async function runExampleAction(config: AppConfig): Promise<ExampleResult> {
  return {
    message: 'done',
    count: 0,
    status: 'ok',
    items: [],
  };
}
```

### Step 4 — Use the contract in the dashboard route (if applicable)

If the new feature is surfaced via the dashboard, the route handler calls the same feature function. Because the feature already returns a type satisfying the schema, the dashboard response is automatically contract-compliant.

---

## When a Contract Is Required vs Optional

| Scenario | Contract required? | Reason |
|----------|--------------------|--------|
| Dashboard API JSON response | **Required** | Dashboard client code depends on exact field names |
| `--json` output consumed by external scripts (documented) | **Required** | Once documented as machine-readable, it is a contract |
| `--json` output of internal/diagnostic commands (`ldev doctor --json`, `ldev context --json`) | **Strongly recommended** | Increasingly used by automation; formalise before the first external consumer |
| CLI text output (`--text`, default) | **Not required** | Format is intentionally informal; changing it is not a breaking change |
| Internal feature-to-feature data (not returned to any surface) | **Not required** | Use plain TypeScript types; no versioning needed |
| Feature function parameters | **Not required** | Parameters are TypeScript-only; Zod validation belongs at the external boundary |

The guiding question: **"Will a machine parse this JSON without knowing the source code?"** If yes, it needs a contract.

---

## Contract Versioning Strategy

`ldev` follows **additive-only evolution within a major version**:

- **Allowed:** Add new optional fields (`z.optional()`)
- **Allowed:** Add new values to an enum (but check all consumers handle unknown values)
- **Allowed:** Relax a type constraint (e.g., `z.string()` → `z.string().or(z.number())`)
- **Not allowed:** Remove or rename existing fields
- **Not allowed:** Change a field from optional to required
- **Not allowed:** Narrow a type in a breaking way

These rules mirror npm semver: patch/minor changes are safe; major changes require a version bump of the package.

When a breaking change is unavoidable:
1. Bump the package major version
2. Document the change in `CHANGELOG.md`
3. Update the audit doc (`docs/architecture/audit-YYYY-MM.md`) to record the decision

There is currently no per-contract versioning (e.g., `v2` namespaces). If the contracts surface grows to the point where independent versioning is needed, address it in a dedicated ADR.

---

## How Contracts Are Used in Dashboard Routes

Dashboard routes (in `src/entrypoints/dashboard/`) are thin HTTP handlers. Their API responses should align with the contracts defined in `core/contracts/` where the underlying data is feature-derived.

The intended pattern (aspirational for routes that return feature data):

```typescript
// src/entrypoints/dashboard/dashboard-inventory-routes.ts
import {runLiferayInventorySites} from '../../features/liferay/inventory/liferay-inventory-sites.js';

async function handleInventorySites(cwd: string, res: http.ServerResponse): Promise<void> {
  try {
    const config = resolveProjectContext({cwd}).config;
    const sites = await runLiferayInventorySites(config);
    // sites is typed as LiferayInventorySites (from core/contracts)
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(sites));
  } catch (err) {
    writeDashboardError(res, err, {internalMessage: 'Could not load sites'});
  }
}
```

Because `runLiferayInventorySites` already returns a type that satisfies `liferayInventorySitesSchema`, the dashboard response is automatically contract-compliant without additional validation.

---

## Adding a New Schema File

If a new domain needs contracts (e.g., `deploy`, `doctor`, `osgi`), create a new file following this template:

```typescript
// src/core/contracts/<domain>.schema.ts
import {z} from 'zod';

/**
 * Schemas for <domain> surfaces.
 * These define normalised output types consumed by CLI --json and the dashboard.
 */

export const myDomainResultSchema = z.object({
  // fields here
});

export type MyDomainResult = z.infer<typeof myDomainResultSchema>;
```

Then add exports to `src/core/contracts/index.ts`.

Do not put Liferay raw API response schemas in a new file if they belong in `shared.schema.ts` (i.e., they are generic response wrappers not specific to one domain).
