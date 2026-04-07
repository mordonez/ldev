---
title: MCP Liferay Capability Matrix
---

# MCP Liferay Capability Matrix

This page answers a product question:

What can an agent realistically `view`, `create`, `modify`, or `delete`
through the official Liferay MCP server in a typical `ldev` demo environment?

The important constraint is simple:

- MCP can only act on what the runtime exposes through OpenAPI
- OAuth2 scopes must allow the target API family
- some resources can be mutated only if a prerequisite resource already exists

This matrix is intentionally explicit about confidence. It separates:

- validated in a real local runtime
- likely available because the OpenAPI family is present
- conditional on prerequisite data such as a structure or site
- not exposed through the current MCP-visible OpenAPI surface

## Validation baseline

This matrix is based on:

- the validated `MCP Demo Environment` flow in a local `blade-workspace`
- `ldev oauth install --scope-profile max-test --write-env`
- the OpenAPI families visible through `ldev mcp openapis --json`
- direct MCP calls through `get-openapi` and `call-http-endpoint`

Validated examples in the runtime:

- OpenAPI discovery through MCP
- Blog post create/read/delete through MCP

See [MCP Demo Environment](/mcp-demo).

## Status legend

| Status | Meaning |
| --- | --- |
| validated | Confirmed in a real MCP session against a local Liferay runtime |
| likely | OpenAPI family is visible and the family usually exposes the operation shape |
| conditional | Likely possible, but depends on a prerequisite such as an existing structure, site, object definition, or enabled application |
| no | Not exposed through the current MCP-visible OpenAPI surface in the validated runtime |

## Detailed matrix

This is the maintainer-facing version of the matrix. It includes the exact scope
aliases that mattered during runtime validation.

| Area | OpenAPI family via MCP | Exact scope alias to use | OpenAPI reachable | View | Create | Modify | Delete | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Blogs | `headless-delivery` | `Liferay.Headless.Delivery.everything.read/write` | yes | yes | yes | yes | yes | validated | Real MCP create/read/delete was validated in `Guest`. |
| Web content articles | `headless-delivery` | `Liferay.Headless.Delivery.everything.read/write` | yes | yes | yes | yes | yes | conditional | Structured content can be managed if a content structure already exists. |
| Content structures | `headless-delivery`, `headless-admin-content` | `Liferay.Headless.Admin.Content.everything.read/write` | yes | yes | no | no clear evidence | no clear evidence | validated/no | MCP-visible OpenAPI exposes reads, permissions, and export, but not structure creation in the validated runtime. |
| Content templates | `headless-delivery` | `Liferay.Headless.Delivery.everything.read/write` | yes | yes | no clear evidence | no clear evidence | no clear evidence | likely/no | The runtime exposes content-template reads, but creation was not found in the checked MCP-visible OpenAPI families. |
| ADTs | none visible | none verified | no | no clear evidence | no | no | no | no | `ldev` still treats ADTs as a JSONWS-backed area today. See [API Surfaces](/api-surfaces). |
| Fragments | none visible | none verified | no | no clear evidence | no | no | no | no | Fragment import/update remains JSONWS-backed in `ldev` today. |
| Style books | no clear family observed | none verified | no | no clear evidence | no | no | no | no | No MCP-visible OpenAPI family for style books was observed in the validated runtime. |
| Display page templates | `headless-admin-content` | `Liferay.Headless.Admin.Content.everything.read/write` | yes | yes | no clear evidence | no clear evidence | no clear evidence | likely/no | Read paths are visible. Create/update was not observed in the checked OpenAPI surface. |
| Page templates | `headless-site`, `headless-admin-content` | `Liferay.Headless.Site.everything.read/write`, `Liferay.Headless.Admin.Content.everything.read/write` | yes | likely | no clear evidence | no clear evidence | no clear evidence | likely/no | Page-related reads are present, but template authoring coverage is not yet clearly exposed for MCP-first workflows. |
| Pages | `headless-site`, `headless-delivery` | `Liferay.Headless.Site.everything.read/write`, `Liferay.Headless.Delivery.everything.read/write` | yes | yes | no clear evidence | no clear evidence | no clear evidence | conditional | The `site-pages` surface is visible, but a minimal create attempt returned `UnsupportedOperationException` in the validated runtime. |
| Navigation menus | `headless-delivery` | `Liferay.Headless.Delivery.everything.read/write` | yes | yes | yes | likely | yes | validated | Navigation menu create/get/delete was validated through MCP in `Guest`. |
| Collections / content sets | `headless-delivery` | `Liferay.Headless.Delivery.everything.read/write` | yes | yes | no clear evidence | no clear evidence | no clear evidence | likely/no | Collection-related read paths are visible as `content-sets`; authoring coverage was not validated. |
| Forms | `headless-form` | `Liferay.Headless.Form.everything.read/write` | yes | no clear evidence | no clear evidence | no clear evidence | no clear evidence | conditional | The scope can be granted, but the runtime returned an anomalous or mismatched OpenAPI document during validation. Do not promise forms until the server-side mapping is verified. |
| Knowledge base | `headless-delivery` | `Liferay.Headless.Delivery.everything.read/write` | yes | yes | likely | likely | likely | likely | Knowledge base articles and folders are visible in the OpenAPI surface. |
| Message boards | `headless-delivery` | `Liferay.Headless.Delivery.everything.read/write` | yes | yes | likely | likely | likely | likely | Message boards and related resources are visible in the OpenAPI surface. |
| Categories and vocabularies | `headless-admin-taxonomy` | `Liferay.Headless.Admin.Taxonomy.everything.read/write` | yes | yes | yes | likely | yes | validated | Taxonomy vocabulary and taxonomy category create/get/delete were validated through MCP in `Guest`. |
| Tags / keywords | `headless-admin-taxonomy` | `Liferay.Headless.Admin.Taxonomy.everything.read/write` | yes | likely | likely | likely | likely | likely | The runtime exposes `keywords` under taxonomy admin, but keyword CRUD was not explicitly exercised in this pass. |
| Users | `headless-admin-user` | `Liferay.Headless.Admin.User.everything.read/write` | yes | yes | likely | likely | likely | likely | User admin family is visible; actual allowed mutations may vary by portal role and environment policy. |
| Site memberships | `headless-admin-user`, `headless-admin-site` | `Liferay.Headless.Admin.User.everything.read/write`, `Liferay.Headless.Admin.Site.everything.read/write` | yes | likely | likely | likely | likely | likely | Conceptually covered by user/site admin surfaces, but this needs a focused validation pass. |
| Teams | no clear family observed | none verified | no | no clear evidence | no clear evidence | no clear evidence | no clear evidence | no | No team-specific MCP-visible family was identified in the current runtime snapshot. |
| Segments | no clear family observed | none verified | no | no clear evidence | no clear evidence | no clear evidence | no clear evidence | no | No segment-specific MCP-visible family was identified in the current runtime snapshot. |
| Object definitions | `object-admin` | `Liferay.Object.Admin.REST.everything.read/write` | yes | yes | yes | likely | yes | validated | `ObjectDefinition` create/delete was validated through MCP. The older alias `Liferay.Object.Admin.everything.*` did not work in this runtime. |
| Object entries | generated custom object REST after publish | `Liferay.Headless.Object.everything.read/write` | conditional | conditional | conditional | conditional | conditional | conditional | Creating entries depends on a published object definition and its generated `/o/c/...` endpoint. This was not fully validated in this pass. |
| Site settings / configuration | `headless-admin-configuration`, `headless-admin-site` | `Liferay.Headless.Admin.Configuration.everything.read/write`, `Liferay.Headless.Admin.Site.everything.read/write` | yes for OpenAPI | no clear evidence | no clear evidence | no clear evidence | no clear evidence | conditional | The OpenAPI became reachable, but a minimal MCP read against `instance-configurations` returned `UnsupportedOperationException` in this runtime. Do not promise usable CRUD yet. |
| Workflow admin | `headless-admin-workflow` | `Liferay.Headless.Admin.Workflow.everything.read/write` | yes for OpenAPI | no clear evidence | no clear evidence | no clear evidence | no clear evidence | conditional | The OpenAPI document became reachable, but a minimal MCP read path returned `404`, and the document looked identical to admin configuration in this runtime. Treat this as anomalous until the server mapping is verified. |
| Redirects | no clear family observed | none verified | no | no clear evidence | no clear evidence | no clear evidence | no clear evidence | no | No MCP-visible redirect API family was identified in the current runtime snapshot. |
| Locked pages | no clear family observed | none verified | no | no clear evidence | no clear evidence | no clear evidence | no clear evidence | no | No MCP-visible OpenAPI family was identified for this area. |
| Search | `search` | `Liferay.Portal.Search.REST.everything.read/write` | yes | likely | not applicable | likely | not applicable | likely | Useful for inspection and query workflows rather than classic CRUD. |
| Notifications | `notification`, `headless-user-notification` | `Liferay.Notification.REST.everything.read/write`, `Liferay.Headless.User.Notification.everything.read/write` | yes | likely | no clear evidence | no clear evidence | no clear evidence | likely | The UI-provided aliases were accepted by the portal and the OpenAPI documents became reachable. CRUD was not yet validated in this pass. |
| Export / import | `export-import`, `headless-batch-engine`, `batch-planner` | `Export.Import.REST.everything.read/write`, `Liferay.Batch.Planner.REST.everything.read/write`, `Liferay.Headless.Batch.Engine.everything.read/write` | yes for `export-import` and `batch-planner`, yes for `headless-batch-engine` OpenAPI only | yes for `export-import` and `batch-planner` | likely for `batch-planner` | likely for `batch-planner` | likely for `batch-planner` | conditional | `Export.Import.REST.*` enabled real MCP reads on `export-import`. `Liferay.Batch.Planner.REST.*` enabled real MCP reads on `batch-planner` plans. `headless-batch-engine` OpenAPI became reachable, but the equivalent minimal MCP read returned `404`, so it should not yet be presented as working. |
| Staging | no clear family observed | none verified | no | no clear evidence | no clear evidence | no clear evidence | no clear evidence | no | Staging should not be promised as MCP-capable until a concrete runtime-visible API family is validated. |

## What changed during validation

These were the most important runtime findings:

- `Liferay.Object.Admin.REST.everything.read/write` worked
- `Liferay.Object.Admin.everything.read/write` did not work in this runtime
- `Liferay.Headless.Admin.Taxonomy.everything.read/write` worked
- `Liferay.Headless.Form.everything.read/write` was granted, but the runtime's
  `headless-form` OpenAPI looked anomalous during validation
- `Liferay.Headless.User.Notification.everything.read/write` and
  `Liferay.Notification.REST.everything.read/write` worked for OpenAPI access
- the portal UI exposed `Export.Import.REST.everything.read/write` for export/import, and that alias worked for the `export-import` OpenAPI family
- `Liferay.Batch.Planner.REST.everything.read/write` worked for `batch-planner`
- `Liferay.Headless.Batch.Engine.everything.read/write` made the OpenAPI reachable, but a minimal MCP read still returned `404`
- `Liferay.Headless.Admin.Configuration.everything.read/write` made the OpenAPI reachable, but a minimal MCP read returned `UnsupportedOperationException`
- `Liferay.Headless.Admin.Workflow.everything.read/write` made the OpenAPI reachable, but the tested MCP read returned `404`

## Alias rule

When there is any mismatch between:

- inferred scope names
- older documentation
- and what the portal UI offers

prefer the portal UI.

That is the safest source for exact alias names in the target runtime.

## Product reading

The matrix leads to a practical product message:

- MCP is already good for content CRUD on supported headless families
- MCP is strongest where Liferay already has a real headless/admin API family
- MCP is not a magic replacement for legacy authoring areas that still lack a
  clean OpenAPI surface

Today, the strongest demo areas are:

- blogs
- web content on existing structures
- objects
- site/page inspection
- taxonomy/category administration
- batch/export/import style automation

The weakest MCP areas today are:

- ADTs
- fragments
- style books
- some design-system and template-authoring surfaces
- staging and other admin areas without a visible OpenAPI family

## Product buckets

Use these buckets when explaining MCP capability at a product level.

### Works

These areas have both:

- the correct OAuth2 alias identified
- real MCP calls validated in the runtime

- blogs
- taxonomy vocabularies and categories
- navigation menus
- object definitions
- export/import process reads
- batch planner reads

### Works with caveats

These areas are reachable and promising, but the current validation still has an
important limitation or prerequisite.

- web content on existing structures
- pages
- notifications
- search
- users and site memberships
- object entries after object-definition publish
- knowledge base
- message boards

Typical caveats:

- requires a prerequisite resource such as a structure or published object
- supports reads clearly, but write paths are not yet validated
- supports OpenAPI access, but the minimal useful workflow still needs a safer
  demo path

### Auth OK but runtime surface looks broken

These areas passed the scope/auth step, but the runtime behavior still looks
incorrect or incomplete.

- `headless-batch-engine`
- `headless-admin-configuration`
- `headless-admin-workflow`
- `headless-form`

Typical symptoms seen during validation:

- OpenAPI reachable but real MCP call returns `404`
- OpenAPI reachable but operation returns `UnsupportedOperationException`
- OpenAPI document appears mismatched with the advertised family

Treat these as runtime or platform-surface issues, not as solved product
capabilities.

## Recommended documentation stance

When presenting MCP to users and contributors:

1. Say clearly that MCP works on the official OpenAPI surface, not on every
   historical Liferay admin capability.
2. Separate `validated now` from `likely but not yet demoed`.
3. Keep `ldev` as the task-shaped workflow layer for local context and fallback
   workflows.
4. Do not promise design-system or legacy template authoring coverage until the
   runtime exposes it cleanly through MCP-visible OpenAPIs.

## Recommended next validation passes

If you want to harden this matrix further, validate these next:

1. object definition create/update/delete through `object-admin`
2. object entry create/update/delete through `headless-object`
3. category and vocabulary CRUD through `headless-admin-taxonomy`
4. page or navigation-menu mutation through the visible site/delivery APIs
5. form CRUD through `headless-form`
6. site membership or user-admin mutation through `headless-admin-user`

## Related docs

- [MCP Demo Environment](/mcp-demo)
- [MCP Strategy](/mcp-strategy)
- [OAuth2 Scopes](/oauth-scopes)
- [API Surfaces](/api-surfaces)

[Back to Home](/)
