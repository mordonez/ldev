# AI Templates Roadmap

Gaps identified after reviewing the full template tree and comparing against the
official Liferay AI Workspace files. Ordered by priority.

This is an internal prioritization document for the `templates/ai` layer, not a
commitment that every item must be implemented as-is.

Priority meanings:

- `P0` — missing contracts or guidance that can cause agents to fail, guess, or
  choose the wrong workflow today
- `P1` — important Liferay coverage gaps where agents can still work, but often
  produce incomplete, shallow, or risky guidance
- `P2` — ergonomics, cleanup, and cross-reference improvements that make the AI
  layer more maintainable and more efficient to use

---

## P0 — Contract Gaps

---

### 1. Headless API — discovery without an operational contract

`ldev mcp openapis --json` is mentioned but no guidance on what to do with it:

- Common endpoints and their purpose: `headless-admin-user`, `headless-delivery`,
  `headless-admin-content`, `object-admin`, `headless-batch-engine`
- Pagination: `page`, `pageSize`, `totalCount`, `lastPage`
- Authentication: Basic (manual test) vs. Bearer OAuth (agents and scripts)
- How to go from `ldev mcp openapis --json` → spec → working endpoint
- Common filters and sorts (`filter`, `search`, `sort`)

**Where:** `developing-liferay/references/headless-api.md`

---

### 2. FTL templates — no authoring guide

Journal Article templates and ADTs are FreeMarker. `structures.md` covers the
CLI but no file documents:

- Context variables available: `entries`, `document`, `reserved_article_title`, etc.
- Field access from FTL: `getterUtil`, `validator`, `.getData()`
- Common patterns: conditionals by field type, iterating sub-fields, responsive images
- Difference between Journal Article template vs. ADT vs. Widget Display Template
- Common FTL errors and how to debug them from logs

**Where:** `developing-liferay/references/ftl-templates.md`

---

## P1 — Coverage Gaps

---

### 3. Permissions model — completely absent

403s, invisible portlets, inaccessible resources: agents have no context to
diagnose them:

- Role types: Regular, Site, Organization, Asset Library
- Resource permissions vs. portal permissions — conceptual difference
- How to verify assigned roles via API: `headless-admin-user` roles + site memberships
- Common failures: user missing site member role, restricted page permissions,
  portlet with Guest access disabled
- How to grant permissions programmatically vs. UI

**Where:** `troubleshooting-liferay/references/permissions.md` + entry in `liferay-expert/SKILL.md`

---

### 4. Service Builder — mentioned without a contract

Service Builder deploy support exists but no guidance on:

- When to use Service Builder vs. plain OSGi service vs. Liferay Object
- `service.xml` structure: entity, columns, finders, exceptions
- What Service Builder generates: `-api`, `-service`, SQL tables
- Update cycle: modify `service.xml` → rebuild → DB migration

**Where:** `developing-liferay/references/service-builder.md`

---

### 5. Modern site building — Display Pages, Collections, Navigation Menus

`liferay-expert` says "ldev has no commands for this, use MCP" but does not give
the alternative flow:

- Display Page Templates: how to assign to an Object or Journal Structure, which
  fields are exposed for fragment mapping, relationship with `ldev portal inventory page`
- Content Page Collections: Manual vs. Dynamic, how to configure a collection via API
- Navigation Menus: exact endpoint (`/o/headless-delivery/v2.0/navigation-menus`)
  with authenticated call example
- When Content Page vs. Widget Page: clear decision tree

**Where:** `developing-liferay/references/site-building.md` + complete MCP flow in `liferay-expert/SKILL.md`

---

### 6. OSGi `.config` files — how to create them, naming, where they live

Agents know OSGi configuration exists but not the contract:

- Naming: `com.liferay.service.FooBarConfiguration.config` (singleton) vs.
  `com.liferay.service.FooBarConfiguration~instanceId.config` (factory)
- Value types: `B` boolean, `I` integer, `L` long, `["array"]` for arrays
- Where they live in ldev-native (Docker volume `liferay/configs/`) vs.
  blade-workspace (`configs/[env]/osgi/configs/`)
- Hot-apply vs. restart required
- Frequent configurations agents are asked about: Elasticsearch, LDAP, OAuth2, Cache

**Where:** `developing-liferay/references/osgi-config.md` + project-type differentiation in runtime rules

---

### 7. Localization / i18n — completely absent

Multilingual is standard in Liferay projects. No guidance on:

- `Language.properties` in OSGi modules
- `Locale` and `themeDisplay.getLocale()` in FTL
- Localized fields in Journal Structures (`localizable: true`) and how to access
  them by locale from FTL
- i18n in Client Extensions (React): how to read the locale from `Liferay.ThemeDisplay`
- How to verify translations via `ldev portal inventory ...`

**Where:** `developing-liferay/references/localization.md`

---

### 8. Taxonomies / Vocabularies / Categories — completely absent

Core content organization in Liferay. No guidance on:

- Site vs. Global vs. Asset Library vocabularies
- How to assign categories to Journal Articles and Assets
- Headless API for vocabularies (`/o/headless-admin-taxonomy/v1.0/`)
- How to use categories in Asset Publisher and Collection Providers
- Difference with Tags (free-form vs. controlled)

**Where:** `developing-liferay/references/taxonomies.md`

---

### 9. LCP (Liferay Cloud) workflow — mentioned without a contract

`ldev db sync` and `ldev db files-download` appear in `troubleshooting-liferay`
without operational context:

- Typical LCP project structure: environments `dev`, `uat`, `prd`
- What information the agent needs before calling `ldev db sync --environment --project`
- `ldev db sync` vs. `ldev db import` — when each
- Document Library: when `ldev db files-download` is necessary and what `ldev db files-mount` does
- What to expect after sync: portal restart, reindex need

**Where:** `troubleshooting-liferay/references/lcp-sync.md`

---

### 10. Content type selection guide

Agents receive "I need to store customer data" or "I want a custom detail page"
and cannot choose:

- Journal Article vs. Liferay Object vs. Document — when each
- Fragment vs. Portlet/Widget vs. Client Extension — decision tree
- Display Page Template vs. Widget Page with Asset Publisher — when
- Object + headless vs. Web Content — selection criteria
- Asset Library vs. site-scoped — when to share resources across sites

**Where:** `liferay-expert/references/content-type-guide.md` + routing entry in `liferay-expert/SKILL.md`

---

### 11. `extending-liferay.md` — too thin to be useful

Currently lists 8 extension points with no examples, no failure causes, no
practical guardrails:

- Each extension point needs: when to use it, minimum structure, `@Component`
  declaration example, common errors
- Service Wrapper: how to override a method without breaking the chain
- Dynamic Include: JSP key naming, where to find available keys
- Model Listener: available events and when they fire
- OSGi Fragment: why it is the last resort and what the upgrade risk is

**Where:** extend `developing-liferay/references/extending-liferay.md`

---

### 12. `theme.md` — thin and references a hardcoded project path

`liferay/themes/` is a project-specific path, not a vendor contract. Also missing:

- Liferay theme architecture: theme-contributors, Clay tokens, `_custom.scss`
- Theme classpath: what can be overridden and what cannot
- Modern theming: CSS variables vs. SCSS variables, Design Token system
- Safe overrides via `_diffs/`
- When to use a Client Extension CSS type instead of a theme (migration signal)

**Where:** extend `developing-liferay/references/theme.md`, remove hardcoded path

---

### 13. `fragments.md` — thin and references a hardcoded project path

`liferay/ub-fragments/` is a project-specific path, not a vendor contract.
Also missing:

- Fragment types: Basic, Component, Form, Collection Display
- Fragment configuration: `fragment.json`, `configuration.json`
- Editable fields: `<lfr-editable>`, `<lfr-css-extension>`
- Fragment Composition vs. standalone fragment
- Portlet fragments: `<lfr-widget-*>` tags

**Where:** extend `developing-liferay/references/fragments.md`, remove hardcoded path

---

## Recommended Next Batch

If this roadmap is executed incrementally, the highest-signal next items are:

1. Headless API discovery contract (`headless-api.md`)
2. FTL templates authoring guide (`ftl-templates.md`)
3. Permissions model (`permissions.md`)

---

## Summary table

| # | Gap | Type | Priority |
|---|---|---|---|
| 1 | Headless API flow | New reference | P0 |
| 2 | FTL templates authoring | New reference | P0 |
| 3 | Permissions model | New reference + routing | P1 |
| 4 | Service Builder | New reference | P1 |
| 5 | Modern site building | New reference + complete skill | P1 |
| 6 | OSGi `.config` files | New reference | P1 |
| 7 | Localization / i18n | New reference | P1 |
| 8 | Taxonomies / Categories | New reference | P1 |
| 9 | LCP sync workflow | New reference | P1 |
| 10 | Content type selection guide | New reference + routing | P1 |
| 11 | `extending-liferay` — too thin | Extend existing reference | P1 |
| 12 | `theme.md` — thin + hardcoded path | Extend + parametrize | P1 |
| 13 | `fragments.md` — thin + hardcoded path | Extend + parametrize | P1 |
