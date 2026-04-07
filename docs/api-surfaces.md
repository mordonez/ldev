---
title: API Surfaces
---

# API Surfaces

`ldev` talks to Liferay through three API surfaces:

1. Headless REST APIs
2. MCP
3. JSONWS

This page exists to give new developers a global view of why all three still
appear in the codebase and how to think about fallbacks.

## Product stance

The intended order of preference is:

1. use a task-shaped `ldev` command first
2. inside `ldev`, prefer Headless REST when it gives the required data or mutation
3. use MCP for OpenAPI discovery and generic endpoint execution
4. keep JSONWS only where it still provides product-critical behavior that is
   not yet available through the higher-level surfaces in a clean way

That means JSONWS is still allowed, but it should be treated as deliberate
technical debt or a platform gap, not as the default path for new work.

## Surface summary

| Surface | Main role in `ldev` | Typical examples |
| --- | --- | --- |
| Headless REST | Primary portal read/write surface | sites, pages, structures, structured content, templates |
| MCP | Official protocol bridge for AI/tool interoperability | `get-openapis`, `get-openapi`, generic endpoint execution |
| JSONWS | Compatibility and fallback surface | layouts, DDM templates, fragment collection/entry APIs, className lookups |

## Headless REST

Headless is the main API surface for `ldev`.

It is the preferred choice when:

- the data model is clear
- the endpoint family is documented and stable
- the operation maps cleanly to the user-facing workflow

Current examples in the codebase:

- site discovery via `headless-admin-site`
- site fallbacks via `headless-admin-user`
- page and content inspection via `headless-delivery`
- structure inspection and mutation via `data-engine`
- structured content updates via `headless-delivery`

This is why the default OAuth2 scope profile is centered around:

- `headless-admin-site`
- `headless-admin-user`
- `headless-delivery`
- `data-engine`

See [OAuth2 Scopes](/oauth-scopes).

## MCP

MCP is not the main implementation surface for `ldev` workflows. It is the
official interoperability layer.

Use MCP when:

- an agent needs to discover the available OpenAPI families dynamically
- a generic headless call is the shortest path
- the task benefits from using the official Liferay MCP server instead of
  hardcoding a specific API family

Current `ldev` support around MCP is intentionally focused on:

- availability checks
- session handshake validation
- OpenAPI discovery

See [MCP Strategy](/mcp-strategy).

## JSONWS

JSONWS still exists in `ldev` for real reasons.

It currently covers a mix of:

- legacy but still useful platform APIs
- surfaces that do not yet have an equivalent `ldev`-friendly headless path
- fallback logic where the headless response is incomplete for the workflow

This does not automatically mean the scopes are wrong.

## How to read a fallback

When you see a JSONWS fallback in `ldev`, classify it in one of these buckets:

### 1. Platform gap

The headless family does not expose the required object or behavior cleanly.

Examples:

- layout tree traversal through `layout/get-layouts`
- fragment entry links for page inspection
- DDM template operations used by ADTs and templates

These are not primarily scope problems.

### 2. Data-shape gap

The headless endpoint exists but does not return enough information for the
specific workflow without extra indirection or lossy inference.

Example:

- looking up a display page article by URL title when the direct headless query
  does not return a match, then falling back to JSONWS article lookup

This may or may not be worth replacing later.

### 3. Compatibility fallback

The headless route works for the common case, but `ldev` keeps a JSONWS path so
that important product cases such as `/global`, company groups, or older portal
behavior still work.

Example:

- site resolution falling back from `headless-admin-site` to `headless-admin-user`
  and finally JSONWS group search

### 4. Suspicious fallback

If a fallback is triggered by `403 Forbidden`, the first suspect is missing
OAuth2 scopes.

If a fallback is triggered by empty results, missing fields, or product-shape
gaps, the first suspect is usually not scopes.

## Current JSONWS usage map

This is the high-level view of where JSONWS is still used.

| Area | Why JSONWS is still used |
| --- | --- |
| Site resolution | Company-group and broad group search fallbacks that are not fully covered by the primary headless route |
| Page layout traversal | Recursive layout tree reads still rely on `layout/get-layouts` |
| Page inspection | Fragment entry links and some journal article lookups still rely on JSONWS |
| Resource site/company helpers | `group/get-group`, `company/get-companies`, `classname/fetch-class-name` |
| Templates and ADTs | DDM template create/update/list flows still rely on JSONWS |
| Fragments | Fragment collection and fragment entry create/update/list flows still rely on JSONWS |
| Structure sync support | Some folder and article helper calls still rely on JSONWS |

## JSONWS endpoint inventory

This inventory is the maintainer-facing view of the current JSONWS footprint.
Use it when deciding whether a JSONWS dependency should stay, be replaced, or
be reclassified as an authorization problem.

| Area | JSONWS endpoint(s) | Main file(s) | Current category | Why it exists today | Replacement outlook |
| --- | --- | --- | --- | --- | --- |
| Site resolution | `company/get-companies`, `group/search-count`, `group/search` | `src/features/liferay/inventory/liferay-inventory-shared.ts` | compatibility fallback | Used after `headless-admin-site` and `headless-admin-user` to resolve groups and edge cases such as company groups and broad site lookup. | Keep for now. Replace only if a headless path can cover `/global` and broad group search reliably. |
| Layout tree traversal | `layout/get-layouts` | `src/features/liferay/page-layout/liferay-layout-shared.ts` | platform gap | Used to recurse the layout tree and resolve real layout records by parent/layout ID. | Good replacement candidate if a stable headless page-tree API can provide the same traversal semantics. |
| Display page article lookup | `journal.journalarticle/get-article-by-url-title` | `src/features/liferay/inventory/liferay-inventory-page.ts` | data-shape gap | Used only when the primary Headless Delivery lookup by `friendlyUrlPath` returns no match. | Review candidate. Investigate whether the headless query can be made reliable before removing. |
| Fragment entry links on a page | `fragment.fragmententrylink/get-fragment-entry-links` | `src/features/liferay/inventory/liferay-inventory-page.ts` | platform gap | Needed to enrich page inspection with widget bindings, editable values, and article references. | Keep until a headless page inspection path exposes equivalent fragment-link detail. |
| Journal article enrichment | `journal.journalarticle/get-latest-article` | `src/features/liferay/inventory/liferay-inventory-page.ts` | data-shape gap | Used to enrich page inspection with article metadata not derived directly from the current headless page path. | Review candidate. Could potentially shrink if page/content inspection becomes more headless-native. |
| Resource site/company helpers | `group/get-group`, `company/get-companies`, `classname/fetch-class-name` | `src/features/liferay/resource/liferay-resource-shared.ts` | platform gap | Needed for company resolution and classNameId lookup used by resource sync internals. | Keep for now. Replace only if a stable supported API exists for class-name and group/company lookup. |
| DDM template listing | `ddm.ddmtemplate/get-templates` | `src/features/liferay/resource/liferay-resource-shared.ts` | legacy dependency | Used to list runtime templates backing ADTs and Journal templates. | Strong replacement candidate if a cleaner headless/admin API can cover template listing semantics. |
| Journal templates | `ddm.ddmtemplate/get-template`, `ddm.ddmtemplate/add-template`, `ddm.ddmtemplate/update-template` | `src/features/liferay/resource/liferay-resource-sync-template.ts` | legacy dependency | Current create/update/read flow for Journal display templates is built on DDM template APIs. | Strong replacement candidate, but only if replacement preserves create/update parity and verification. |
| ADTs | `ddm.ddmtemplate/get-template`, `ddm.ddmtemplate/add-template`, `ddm.ddmtemplate/update-template` | `src/features/liferay/resource/liferay-resource-sync-adt.ts` | legacy dependency | ADT sync currently depends on DDM template APIs directly. | Strong replacement candidate if a supported API exists with equivalent widget/ADT semantics. |
| Fragment collections and entries | `fragment.fragmentcollection/*`, `fragment.fragmententry/*` | `src/features/liferay/resource/liferay-resource-sync-fragments.ts`, `src/features/liferay/resource/liferay-resource-shared.ts` | legacy dependency | Fragment import/update/list flows still rely on JSONWS collection and entry endpoints. | Good replacement candidate if fragment management APIs become stable enough to preserve import behavior. |
| Structure sync folder helpers | `journal.journalfolder/get-folders` | `src/features/liferay/resource/liferay-resource-sync-structure.ts` | platform gap | Used while walking Journal folder state for content synchronization. | Review candidate if a headless folder API can cover the same traversal. |

## How to use this inventory

When reviewing one row from the table above:

1. Check whether the current JSONWS call is on the hot path or only a fallback.
2. Check whether failures are `403` auth errors or non-auth shape/coverage gaps.
3. If the problem is auth, prefer fixing scopes and documenting the reason in
   [OAuth2 Scopes](/oauth-scopes).
4. If the problem is API coverage, keep the JSONWS call but classify it
   explicitly as `platform gap`, `data-shape gap`, `compatibility fallback`, or
   `legacy dependency`.
5. If replacing it, keep the user-facing workflow and verification behavior at
   least as strong as the old path.

## Prioritization

Use this as the current maintenance priority.

### Do not touch unless the platform changes

These JSONWS usages are not attractive refactor targets today because they are
either compatibility-critical or depend on capabilities that are not cleanly
available elsewhere yet.

| Area | Reason |
| --- | --- |
| Site resolution fallback | Important for edge cases such as company groups and broad site lookup. A weaker replacement would hurt first-run UX. |
| Resource site/company helpers | `group/get-group`, `company/get-companies`, and `classname/fetch-class-name` are infrastructure helpers, not the best place to burn product time unless a clear supported replacement appears. |
| Fragment entry links on a page | This is core to rich page inspection, and the JSONWS path currently carries information that `ldev` depends on. |
| Structure sync folder helpers | Keep unless a verified headless folder traversal exists with equivalent behavior. |

### Review when touching nearby code

These are worth revisiting during adjacent feature work, but they do not justify
an isolated refactor on their own yet.

| Area | Reason |
| --- | --- |
| Display page article lookup fallback | Could possibly be simplified if the headless query path becomes more reliable. |
| Journal article enrichment in page inspection | Might shrink naturally if page/content inspection becomes more headless-native. |
| Layout tree traversal | A good candidate if a stable page-tree API emerges, but not worth speculative churn. |

### Attack first if reducing JSONWS becomes a goal

These are the best candidates for intentional cleanup because they are larger
workflow surfaces, more obviously legacy, and more likely to benefit from a
cleaner supported API if one exists.

| Area | Why it should be first |
| --- | --- |
| Journal templates (`ddm.ddmtemplate/*`) | Central workflow surface, clearly legacy-shaped, and duplicated across create/update/read flows. |
| ADTs (`ddm.ddmtemplate/*`) | Same family as templates, so improvements here may unlock both areas together. |
| Fragment collections and entries (`fragment.fragmentcollection/*`, `fragment.fragmententry/*`) | Large user-facing workflow surface where a modern replacement could remove a lot of JSONWS weight. |
| DDM template listing | Good leverage point because it supports multiple higher-level workflows. |

## Recommended roadmap

If `ldev` decides to actively reduce JSONWS, this is the pragmatic order:

1. Audit DDM template and ADT replacement options together.
2. Audit fragment management replacement options.
3. Revisit layout/page inspection fallbacks only after the authoring/resource
   workflows are clearer.
4. Leave compatibility and infrastructure helpers for last.

## What this means for scopes

Do not assume that adding more headless scopes will automatically remove JSONWS
from the implementation.

Sometimes the missing piece is:

- no equivalent headless endpoint
- no equivalent response shape
- no task-shaped workflow yet in `ldev`

Adding scopes is the right fix only when the existing intended headless call is
failing due to authorization.

## Guidance for future changes

When touching one of these areas:

1. Prefer replacing JSONWS only when the headless path is genuinely simpler or
   more stable for the user-facing workflow.
2. Do not add a new JSONWS dependency if a clear headless path already exists.
3. If you keep a fallback, document which bucket it belongs to:
   `platform gap`, `data-shape gap`, `compatibility fallback`, or `scope fallback`.
4. If the issue is actually missing authorization, fix the OAuth2 scope profile
   and document why that scope is required.

## Related docs

- [OAuth2 Scopes](/oauth-scopes)
- [MCP Strategy](/mcp-strategy)
- [Architecture](/architecture)
- [Portal Inventory](/portal-inventory)

[Back to Home](/)
