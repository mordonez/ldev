# Reindex After Import

Use this reference right after importing a DB or restoring an environment when search is not healthy yet.

## Recommended flow

1. Confirm the portal is healthy:

```bash
ldev status --json
```

2. Observe reindex:

```bash
ldev portal reindex status --json
ldev portal reindex tasks --json
ldev portal reindex watch --json
```

3. Enable speedup only during a real reindex:

```bash
ldev portal reindex speedup-on
ldev portal reindex speedup-off
```

## What to validate

- A real reindex task exists
- The index is progressing
- Recent logs do not show new failures

```bash
ldev logs --since 10m --service liferay --no-follow
```

## Guardrails

- Do not leave `speedup-on` enabled afterwards
- Do not assume that clicking reindex means the reindex is actually running
