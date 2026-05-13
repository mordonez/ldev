# ldev — Contract Guide

This document explains what contracts are in `ldev`, where they live, how to write them, and when they are required. The target audience is a contributor adding a new MCP tool, dashboard API route, or CLI command with machine-readable output.

---

## Why Contracts Exist

`ldev` exposes its functionality through three surfaces:

1. **CLI** (`ldev <command>`) — human-readable text or `--json`/`--ndjson` for scripting
2. **MCP server** (`ldev-mcp-server`) — structured JSON returned to AI agents via the Model Context Protocol
3. **Dashboard** (`ldev dashboard`) — a local web UI that calls an HTTP API

The CLI text output is intentionally informal: format it however serves the human reader. But the MCP server and dashboard are **automation consumers**: they parse JSON programmatically, and they break silently when a field is renamed or its type changes.

Contracts solve this problem. A contract is a Zod schema that:
- Defines the exact shape of a JSON output consumed by automation
- Is the single source of truth for both the producer (feature function) and the consumers (MCP tool, dashboard route, external scripts)
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

Inventory domain contracts — used by MCP tools that list Liferay content:

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

Resource sync contracts — used by MCP tools and dashboard routes that report sync results:

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
 * Consumed by: MCP tool tool-example.ts, dashboard /api/example
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
- Mark internal-only schemas (used by one feature, not by MCP or dashboard) with a JSDoc comment saying "not a public contract."
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

### Step 4 — Use the schema in the MCP tool

MCP tool files use `runJsonTool` which wraps the feature call. The return value is automatically serialised to JSON. You do not need to call `exampleResultSchema.parse()` in the tool — the TypeScript type system ensures alignment. Use `parse` only in tests or when validating actual API responses.

```typescript
// src/entrypoints/mcp-server/tools/tool-example.ts
import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runExampleAction} from '../../features/example/example-action.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'example_action';

export const inputSchema = {
  filter: z.string().optional().describe('Optional filter string'),
};

export const description = 'Run the example action and return a structured result.';

export async function handleTool(input: {filter?: string}, config: AppConfig) {
  return runJsonTool(() => runExampleAction(config));
}
```

---

## When a Contract Is Required vs Optional

| Scenario | Contract required? | Reason |
|----------|--------------------|--------|
| MCP tool return value | **Required** | AI agents parse the JSON; shape changes break integrations silently |
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

## How Contracts Are Used in MCP Tools

Every MCP tool follows the same three-step pattern:

```
handleTool(input, config) → runJsonTool(() => runFeatureFunction(config, input))
```

1. `runJsonTool` catches exceptions and wraps them as `{isError: true, content: [{text: message}]}`.
2. On success, `jsonToolResult(value)` serialises the feature result to JSON and also populates `structuredContent` if the value is a plain object (not an array). This allows MCP clients that support structured content to receive typed responses.
3. The Zod schema in `core/contracts/` defines the type guarantee. The tool file does not need to validate the output — TypeScript type-checks it at compile time.

Example — `tool-liferay-inventory-sites.ts`:

```typescript
import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayInventorySites} from '../../features/liferay/inventory/liferay-inventory-sites.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_inventory_sites';
export const inputSchema = {
  pageSize: z.number().optional().describe('Max sites per request (default 200)'),
};
export const description = 'List all accessible Liferay sites with their group IDs and friendly URLs.';

export async function handleTool(input: {pageSize?: number}, config: AppConfig) {
  return runJsonTool(() => runLiferayInventorySites(config, {pageSize: input.pageSize}));
}
```

The `runLiferayInventorySites` function returns `LiferayInventorySite[]`, which is defined by `liferayInventorySitesSchema` in `src/core/contracts/inventory.schema.ts`. The MCP client receives a JSON array matching that schema.

---

## How Contracts Should Be Used in Dashboard Routes

Dashboard routes (in `src/entrypoints/dashboard/`) are currently thin HTTP handlers. As the dashboard matures, its API responses should align with the same contracts that MCP tools use where the underlying data is the same.

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

Because `runLiferayInventorySites` already returns a type that satisfies `liferayInventorySitesSchema`, the dashboard response is automatically contract-compliant without additional validation. The dashboard client and the MCP tool are then guaranteed to receive the same structure.

---

## Adding a New Schema File

If a new domain needs contracts (e.g., `deploy`, `doctor`, `osgi`), create a new file following this template:

```typescript
// src/core/contracts/<domain>.schema.ts
import {z} from 'zod';

/**
 * Schemas for <domain> surfaces.
 * These define normalised output types consumed by MCP and dashboard.
 */

export const myDomainResultSchema = z.object({
  // fields here
});

export type MyDomainResult = z.infer<typeof myDomainResultSchema>;
```

Then add exports to `src/core/contracts/index.ts`.

Do not put Liferay raw API response schemas in a new file if they belong in `shared.schema.ts` (i.e., they are generic response wrappers not specific to one domain).
