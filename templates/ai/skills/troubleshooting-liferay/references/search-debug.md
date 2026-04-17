# Search and Buscadores Troubleshooting

Use this reference when a search widget is not returning results, is visually
broken, or behaves differently than expected across environments.

This reference covers: search bar/results, filter widgets (category, tag,
keyword), and Elasticsearch health. It does not cover DDM structure indexing
(see `reindex-after-import.md` and `reindex-journal.md`).

## Establish baseline first

Before debugging the search widget, confirm the portal is healthy and the
index exists:

```bash
ldev status --json
ldev doctor --json
ldev portal reindex status --json
```

If the portal is not running or a reindex is in progress, resolve that first.

## Diagnose the buscador (search widget) problem

### 1. Confirm the symptom type

| Symptom | Likely cause |
|---|---|
| Search returns 0 results for any query | Reindex incomplete or Elasticsearch down |
| Search returns results but "no results" message shows | Display condition in FTL/ADT or CSS visibility bug |
| Search works on desktop but not mobile | CSS/responsive bug in ADT or theme |
| Search results are stale or missing recent content | Incremental reindex did not run or failed |
| Filters (category, tag, keyword) have no effect | Widget configuration or missing vocabulary mapping |
| Search works logged in but not as guest | Permissions issue on documents or web content |

### 2. Check index health

```bash
# Identify Elasticsearch container name from docker-compose
ldev logs --since 2m --service elasticsearch --no-follow

# Then check cluster health from inside the container
ldev shell --service elasticsearch
curl -s http://localhost:9200/_cluster/health?pretty
curl -s http://localhost:9200/_cat/indices?v
```

A healthy cluster shows `status: green` or `yellow`. `red` means at least one
primary shard is unassigned — search will return incomplete results.

### 3. Force a full search reindex

```bash
ldev portal reindex watch --json
```

If the reindex is hanging, enable speedup while it runs:

```bash
ldev portal reindex speedup-on
# wait for reindex to complete
ldev portal reindex speedup-off
```

After reindex completes, check for remaining reindex tasks:

```bash
ldev portal reindex tasks --json
```

### 4. Inspect the search widget configuration

If the portal index is healthy but the buscador still returns no results, the
problem is likely in the widget or ADT configuration:

1. Open the affected page in the portal UI as an administrator.
2. On the Search Results portlet: **Configure → General → Scope**.
   - Confirm "Everything" or the correct site scope is selected.
3. On the Search Bar portlet: **Configure → General → Scope**.
   - Confirm it matches the Search Results portlet scope.
4. Check **Search Options** portlet if present — it may override scope.

For Search Results with an ADT:

```bash
ldev resource export-adt --site /<site> --key <ADT_KEY> --widget-type AssetPublisher --json
```

Review the FTL template for conditions that hide results:

```ftl
<#if entries?has_content>
  ...
<#else>
  <p>No results found</p>
</#if>
```

If `entries` is empty because the wrong type is indexed, check the asset class
configured in the Search Results or Asset Publisher portlet.

### 5. Check permissions on search results

If logged-in users see results but guests do not:

1. Control Panel → **Web Content** → find a sample content item.
2. Permissions → verify "View" is granted to "Guest".

Or check via portal inventory for the page:

```bash
ldev portal inventory page --url <fullUrl> --json
```

If the page is private (not public), guests cannot see search results regardless
of index state.

### 6. Filter widgets (category / tag / keyword)

For a filter that has no visible effect or shows no options:

1. Confirm the vocabulary is assigned to the site:
   Control Panel → **Categorization → Vocabularies** → check site scope.

2. Confirm the vocabulary's `Visibility` is set to **Public** if guest access is required.

3. In the filter portlet configuration, verify the vocabulary is selected.

4. If the filter was working and stopped, run a reindex scoped to categories:
   ```bash
   ldev portal reindex watch --json
   ```

For ERC-based filter scripts that fail (e.g. in Groovy or FTL conditions):
See `../developing-liferay/references/groovy-console.md` for ERC inspection.

### 7. Visual issues with "Limpiar" (clear) button

If the "Limpiar" or clear button is not visible or misaligned:

This is typically a CSS or theme issue, not a search index issue.

1. Inspect the button in browser DevTools to confirm it is rendered but hidden.
2. If hidden: CSS rule applied by the theme or a custom SCSS override.
   - Check `custom.scss` or a theme fragment with a `button[type="reset"]` selector.
   - Otherwise export and review the search ADT with `ldev resource export-adt`.
3. If not rendered: the FTL template governing the filter widget does not
   include the reset button for the current configuration.
   - Export the ADT and check for `<#if showClearButton>` or similar conditions.

Verify the fix with browser automation after applying:
```bash
playwright-cli screenshot --url <pageUrl> --filename before.png
```

## Guardrails

- Do not assume a broken search is caused by a portal bug without confirming
  the index is healthy first. Reindex solves ~80% of search regressions.
- Do not force a full portal reindex when only one content type is affected;
  use the targeted reindex action in Control Panel if available.
- Do not edit ADT templates directly in the portal UI. Export, edit locally,
  validate, import.
- When verifying a fix to a search widget, use `playwright-cli` to confirm the
  visual result — CLI or reindex completion alone is not sufficient proof.
