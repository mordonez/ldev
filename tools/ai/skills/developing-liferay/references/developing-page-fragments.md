# Developing Page Fragments Reference

Use this reference for concrete implementation details, compatibility checks, and safe defaults.

## Table of contents

1. Project conventions (`liferay/ub-fragments/sites`)
2. Editor-first workflow
3. Fragment configuration model
4. Configuration safety patterns
5. Drop zones
6. Custom fields
7. Styling and style attributes
8. Contributed fragment sets
9. Validating configuration values
10. Inspecting fragments with the CLI
11. Including default resources
12. Element ordering
13. Form fragments
14. Compatibility and deprecations
15. Official docs reviewed

## 1) Project conventions (`liferay/ub-fragments/sites`)

Current project source:
- Collection root: `liferay/ub-fragments/sites/<site>/src/<collection>`
- Collection metadata: `liferay/ub-fragments/sites/<site>/src/<collection>/collection.json`
- Fragment folders: `liferay/ub-fragments/sites/<site>/src/<collection>/fragments/<slug>`
- Fragment display names follow `UB_FRG_*` in `fragment.json`

Operational convention:
- Use `task liferay -- resource fragments --site /<site>` for runtime discovery.
- Do not collapse collections with equal display name; different slugs may map to different resources in use.

File-structure reality in this repo:
- Some fragments use `main.js` / `styles.css` / `configuration.json`.
- Others use `index.js` / `index.css` / `index.json`.
- Both are valid because each fragment declares paths explicitly in `fragment.json`.

Do not normalize file names unless you also update `fragment.json` references.

Validation gate used by the project:

```bash
cd docker
make validate-fragments-json
```

This command validates JSON syntax under `liferay/ub-fragments/sites/<site>/src` and is already part of `make prepare`.

## 2) Editor-first workflow

- Prefer the Fragments Editor UI as the default workflow.
- Use code tabs (HTML/CSS/JavaScript), resources, and configuration panel from the editor.
- `configurationRole` options (`style`, `advanced`) are supported in newer 7.4 builds (GA23+/U23+).
- React static imports in fragment JavaScript are supported in recent versions (Portal GA125+, DXP 2025.Q1+/7.4 U92+).

## 3) Fragment configuration model

- Use supported configuration field types from the configuration types reference.
- Newer 7.4 builds allow defining config without wrapping inside `fragmentConfiguration`.
- Newer builds also add additional field types like `length`.

Common field families:
- Basic input fields (`text`, `textarea`, `select`, `checkbox`, `number`, `length`)
- Data-aware fields (`itemSelector`, mapping-related options)
- Style/layout fields (`colorPicker`, `margin`, `padding`, alignment/layout controls)
- Advanced selectors (collection/navigation/object fields depending on version)

## 4) Configuration safety patterns

- Escape user-provided values before inserting into raw HTML.
- Use fallback values for optional fields.
- Guard null/undefined before string concatenation or numeric operations.
- Keep defaults in config schema and runtime fallback in template/JS.

Safe pattern example:

```js
const title = configuration?.title || "Default title";
const count = Number(configuration?.itemsToShow ?? 0);
```

## 5) Drop zones

- Use drop zones to allow nested components in fragment areas.
- Keep number of drop zones bounded for maintainability and editor performance.
- Guidance in docs warns against very high drop-zone counts (for example >100).

## 6) Custom fields

- Fragments can consume custom fields (for site/page/content scenarios).
- If users lack permission to view fields (for example Guest), values can be absent without throwing hard errors.
- Always code with permission-aware fallbacks.

## 7) Styling and style attributes

- Use style books and fragment style options where possible.
- Use fragment-specific style attributes only when supported by your target version.
- Attributes such as `data-lfr-styles` and `data-lfr-background-image-id` are version-gated (7.4 GA31+/U31+).

## 8) Contributed fragment sets

- Use contributed sets for packaged/reusable sets distributed as modules.
- Follow strict naming rules in set metadata and folder naming.
- Use this path when fragments must be distributed with code instead of manual editor ownership.

## 9) Validating configuration values

- Use `validation` rules on config fields.
- Validate numeric ranges, string patterns, required fields, and URL/email formats as needed.
- Treat validation as editor-time guardrails; still keep runtime null-safe handling.

## 10) Inspecting fragments with the CLI

- Use `task liferay -- resource fragments --site /<site>` for runtime discovery.
- Use `task liferay -- inventory page --url <pageUrl>` to confirm which page and admin URLs are affected.
- The stable `dev-cli` surface does not import or sync fragments yet.
- For edits, use the project's explicit fragment workflow or the Liferay UI.
- Use logs to confirm runtime behavior and detect validation or permission errors.

Local example:

```bash
task liferay -- resource fragments --site /global
task liferay -- inventory page --url <pageUrl>
docker compose logs liferay --since 2m
```

Verification notes:
- Fragment panel text search can be incomplete (pagination, filters, language labels).
- Prefer import summary and deterministic checks:
  - DB check in `fragmententry`
  - JSONWS `fragment.fragmententry/get-fragment-entries` with authenticated `p_auth`

## 11) Including default resources

- Fragment sets can include default JS/CSS resources.
- Keep shared resources minimal and deterministic.
- Use versioned/static resource names to avoid cache confusion.

## 12) Element ordering

- Use fragment ordering attributes (for example `data-lfr-priority`) when element order in editor/UI matters.
- Keep priorities explicit and documented in fragment code.

## 13) Form fragments

- Form fragments are documented under Site Building in recent docs:
  - `.../sites/creating-pages/page-fragments-and-widgets/using-form-fragments/creating-form-fragments`
- The old development-path URL currently returns an internal error page.
- Newer docs also note deprecation of embedding widgets in fragments (2024.Q4+/GA129+), so prefer current form-fragment patterns.

## 14) Compatibility and deprecations

- Fragments Toolkit deprecated in DXP 2024.Q1+/Portal GA112+.
- This repository still has a legacy generator project (`liferay/ub-fragments/sites`) used for current assets.
- Prefer Fragments Editor and explicit project workflows for new work; do not assume the stable `dev-cli` can import/export fragment sets.
- Review fragment-specific tags reference for your target version:
  - Current reference for modern DXP/Portal
  - Legacy reference for 7.3 and earlier

Quick check before implementation:
1. Confirm target product version (DXP quarterly or Portal GA).
2. Confirm whether feature is version-gated (`configurationRole`, `length`, `data-lfr-styles`, React static imports).
3. Confirm whether feature is deprecated (Toolkit, widget embedding in fragments).

## 15) Official docs reviewed

- https://learn.liferay.com/w/dxp/development/developing-page-fragments
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/using-the-fragments-editor
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/using-the-fragments-toolkit
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/adding-configuration-options-to-fragments
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/best-practices-for-using-fragment-configurations
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/defining-fragment-drop-zones
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/using-custom-fields-in-page-fragments
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/applying-styles-to-fragments
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/creating-a-contributed-fragment-set
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/validating-fragment-configurations
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/auto-deploying-fragments
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/including-default-resources-with-fragments
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/setting-the-order-of-elements-in-a-fragment
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/creating-form-fragments
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/reference
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/reference/fragment-configuration-types-reference
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/reference/fragment-specific-tags-and-attributes-reference
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/reference/fragments-toolkit-command-reference
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/reference/page-fragment-editor-interface-reference
- https://learn.liferay.com/w/dxp/development/developing-page-fragments/reference/fragment-specific-tags-and-attributes-reference/fragment-specific-tags-and-attributes-reference-for-liferay-73-and-earlier-versions
- https://learn.liferay.com/w/dxp/sites/creating-pages/page-fragments-and-widgets/using-form-fragments/creating-form-fragments
