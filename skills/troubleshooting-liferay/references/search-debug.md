# Search and Buscadores Troubleshooting

Use this reference when a search widget is not returning results, is visually
broken, or behaves differently across environments.

Hard boundary: `ldev` cannot force or start reindex. If reindex is required, a
human must run it from the Liferay UI. Use `ldev` only for health checks, logs,
inventory, and browser validation around that manual step.

## Establish Baseline First

```bash
ldev status --json
ldev doctor --json
ldev logs diagnose --since 10m --json
```

If the portal is not running, resolve that first.

## Symptom Triage

| Symptom | Likely cause |
|---|---|
| Search returns 0 results for any query | Stale/incomplete index or Elasticsearch down |
| Search returns results but "no results" message shows | Display condition in FTL/ADT or CSS visibility bug |
| Search works on desktop but not mobile | CSS/responsive bug in ADT or theme |
| Search results are stale or missing recent content | Incremental indexing failed or manual reindex is needed |
| Filters have no effect | Widget configuration or missing vocabulary mapping |
| Search works logged in but not as guest | Permissions issue on documents or web content |

## Check Elasticsearch Health

```bash
ldev logs --since 2m --service elasticsearch --no-follow
ldev shell --service elasticsearch
curl -s http://localhost:9200/_cluster/health?pretty
curl -s http://localhost:9200/_cat/indices?v
```

A healthy cluster shows `green` or `yellow`. `red` means search may return
incomplete results.

## Manual Reindex

If content exists, permissions are correct, Elasticsearch is healthy, and search
still looks stale, ask a human to force the relevant reindex in the Liferay UI.

Typical manual path: Control Panel -> Configuration -> Search -> Index Actions.
Use the most targeted available action for the affected content type.

After the manual UI action, verify the affected search page in browser and check
fresh logs:

```bash
ldev logs diagnose --since 10m --json
```

## Search Widget Configuration

If the index is healthy but the buscador still returns no results:

1. Open the affected page in the portal UI as an administrator.
2. On Search Results: Configure -> General -> Scope.
3. On Search Bar: Configure -> General -> Scope.
4. Check Search Options if present.

For Search Results with an ADT:

```bash
ldev resource export-adt --site /<site> --adt <ADT_KEY> --widget-type AssetPublisher --json
```

Review the FTL for conditions that hide results.

## Permissions

If logged-in users see results but guests do not:

1. Control Panel -> Web Content -> sample content item.
2. Permissions -> verify View is granted to Guest.
3. Confirm the page is public through portal inventory:

```bash
ldev portal inventory page --url <fullUrl> --full --json
```

## Filters

For category, tag, or keyword filters:

1. Confirm the vocabulary is assigned to the site.
2. Confirm visibility is Public if guest access is required.
3. Verify the filter portlet configuration selects the expected vocabulary.
4. If stale indexing is likely, ask a human to run the targeted UI reindex
   action for categories/vocabularies when available.

## Visual Issues

If "Limpiar" or another button is hidden or misaligned, treat it as CSS/theme
or ADT behavior first, not an index problem. Verify the fix with browser
automation after applying it.

## Guardrails

- Do not present `ldev` as a way to force reindex.
- Do not ask for a full portal reindex when a targeted UI action is available.
- Do not edit ADTs in the portal UI; export, edit locally, validate, import.
- Browser-visible search fixes require browser validation; logs or manual
  reindex alone are not sufficient proof.
