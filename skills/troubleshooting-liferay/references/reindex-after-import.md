# Reindex After Import

Use this reference after importing a DB or restoring an environment when search
is not healthy yet.

## Hard Boundary

`ldev` cannot force or start a Liferay reindex. The only supported way to force
reindex is manual action in the Liferay UI by a human.

Do not tell agents to run any reindex CLI command to start reindexing. `ldev`
may be used only for surrounding health checks and logs.

## Recommended Flow

1. Confirm the portal and Elasticsearch are healthy:

```bash
ldev status --json
ldev doctor --portal --json
ldev logs diagnose --since 10m --json
```

2. Ask the human to start the required reindex in the Liferay UI.

Typical manual path: Control Panel -> Configuration -> Search -> Index Actions,
then run the relevant reindex action for the affected content.

3. After the manual UI action, observe behavior through the affected page,
portal inventory, and logs:

```bash
ldev portal check --json
ldev logs diagnose --since 10m --json
```

## Guardrails

- Do not claim reindex was executed by `ldev`.
- Do not assume that clicking reindex means indexing completed; verify the
  affected search result or page behavior.
- If the issue remains after manual reindex, continue search/runtime diagnosis.
