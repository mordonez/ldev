# Reindex Journal Reference

Use this reference when the problem affects `JournalArticle` specifically or the reindex looks incomplete.

## Typical signals

- Global reindex finishes but web content is still missing
- The index progresses much more slowly than expected
- Persistent differences remain between DB reality and Elasticsearch

## Base commands

```bash
ldev portal reindex status --json
ldev portal reindex tasks --json
ldev portal reindex watch --json
ldev logs --since 10m --service liferay --no-follow
```

## What to look for

- `RUNNING` or failed tasks
- Parse or mapping errors in logs
- Signals that only Journal is failing instead of the whole index

## Guardrails

- Do not restart reflexively if reindex is still progressing
- If you suspect corrupt data, capture evidence before any cleanup
