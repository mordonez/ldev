# Reindex Journal Reference

Use this reference when the problem affects `JournalArticle` specifically or
web content search looks stale after import, migration, or cleanup.

## Hard Boundary

`ldev` cannot force Journal reindexing. A human must start the relevant reindex
from the Liferay UI. Do not use or document CLI reindex commands.

Typical manual path: Control Panel -> Configuration -> Search -> Index Actions,
then choose the Journal/Web Content related reindex action when available.

## What To Check Before Asking For Reindex

```bash
ldev status --json
ldev doctor --portal --json
ldev logs diagnose --since 10m --json
```

Also verify the affected content exists and is published through portal
inventory or the content UI before assuming the index is stale.

## What To Validate After Manual Reindex

- The affected web content appears in search or Asset Publisher results.
- Logs do not show fresh indexing or mapping errors.
- Browser-visible behavior matches the original Green criteria.

## Guardrails

- Do not restart reflexively if manual reindex is still running.
- If you suspect corrupt data, capture evidence before cleanup.
