# Production-Like Reproduction

Use this reference when a problem depends on real data volume, imported content,
or runtime state that a clean local environment cannot reproduce.

## Bring production-like state locally

```bash
ldev db sync --environment <env> --project <lcp-project> --force
```

If you already have a local backup file:

```bash
ldev db import --file /path/to/backup.sql.gz --force
```

When the issue depends on Document Library files:

```bash
ldev db files-download --environment <env> --project <lcp-project> --doclib-dest docker/doclib/<env>
ldev db files-mount --path docker/doclib/<env>
```

If the files are not coming from Liferay Cloud, mount the prepared local path:

```bash
ldev db files-mount --path /path/to/manual/doclib
```

Then restart the diagnosis loop:

```bash
ldev start
ldev doctor --json
ldev portal inventory sites --json
ldev logs diagnose --since 15m --json
```

## Post-import content volume

After importing a production database, Journal content volume may be too large
for practical local reindexing or normal day-to-day use.

Check volume per site before reindexing:

```bash
ldev portal inventory sites --with-content --sort-by content
```

Scope to one site for folder-level detail:

```bash
ldev portal inventory sites --site /<site> --with-structures --limit 20
```

If volume is too high, preview a prune first:

```bash
ldev portal content prune \
  --group-id <groupId> \
  --root-folder <folderId> \
  --keep 100 \
  --dry-run
```

Review the dry-run output before applying. Run without `--dry-run` only when
the plan is correct.

Use `--keep-scope structure` when you want to retain the N most recent articles
per structure type across all selected folders instead of per folder.