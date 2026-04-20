---
title: Data and Deploy Commands
description: Minimal reference for production-to-local state transfer and local fix application.
---

# Data and Deploy Commands

## Database workflows

### `ldev db sync`

Download and import a database backup from Liferay Cloud in one step.

```bash
ldev db sync --environment production --project my-lcp-project --force
ldev db sync --backup-id 20230901-123456 --force
ldev db sync --force --skip-post-import
```

`--force` replaces the current local postgres-data before importing. `--skip-post-import` skips the `docker/sql/post-import.d/*.sql` scripts after the import.

### `ldev db download`

Download a backup from Liferay Cloud into `docker/backups` without importing it.

```bash
ldev db download --environment prd --project my-lcp-project
ldev db download --backup-id 20230901-123456
```

### `ldev db import`

Import a local SQL backup into local PostgreSQL.

```bash
ldev db import --force
ldev db import --file /path/to/backup.sql.gz --force
ldev db import --force --skip-post-import
```

If `--file` is omitted, `ldev` autodetects the newest `.gz`, `.sql`, or `.dump` under `docker/backups`.

### `ldev db query`

Execute SQL directly against the local PostgreSQL container.

```bash
ldev db query "SELECT count(*) FROM journalarticle"
ldev db query --file scripts/check-articles.sql
```

## Document Library workflows

### `ldev db files-download`

Download Document Library content from Liferay Cloud.

```bash
ldev db files-download --environment production --project my-lcp-project \
  --doclib-dest docker/doclib/production
ldev db files-download --environment production --project my-lcp-project --background
```

### `ldev db files-mount`

Mount or recreate the Docker volume for the Document Library.

```bash
ldev db files-mount --path docker/doclib/production
```

Use this when the doclib path is local or was copied manually from outside Liferay Cloud.

### `ldev db files-detect`

Detect a `document_library` directory and persist the discovered path to `docker/.env`.

```bash
ldev db files-detect
ldev db files-detect --base-dir /some/start/dir
```

## Content sanitation

### `ldev portal content prune`

Reduce oversized Journal content in a local portal after importing a large database. Uses Liferay APIs only, not raw SQL.

```bash
ldev portal content prune --group-id 2710030 --root-folder 15588732 --keep 100 --dry-run
ldev portal content prune --site /guest --root-folder 12345 --structure FITXA --keep 3 --keep-scope structure --dry-run
ldev portal content prune --site /estudis --root-folder 12345 --keep 0
```

Rules:

- Exactly one of `--site` or `--group-id` is required.
- `--root-folder` is repeatable and required.
- `--structure <key>` (repeatable) filters articles in scope.
- `--keep N` retains the N most recent items; `--keep-scope structure` applies it per structure across all selected folders; default is `folder`.
- Without `--keep`, all in-scope articles are deleted.
- Folders are only removed when they end up empty.

Always run with `--dry-run` first and only apply the plan once the counts match the expected cleanup scope.

### `ldev portal inventory sites --with-content`

Inspect Journal content volume before deciding what to prune.

```bash
ldev portal inventory sites --with-content --sort-by content
ldev portal inventory sites --with-content --group-id 2710030 --limit 20
ldev portal inventory sites --site /facultat-farmacia-alimentacio --with-structures --limit 20
```

Treat `--with-content --sort-by content` as a fast radar. Use `--site`/`--group-id` scoped mode when you need the exact folder and structure counts that drive a prune.

## Deploy workflows

### `ldev deploy prepare`

Build artifacts without touching runtime state.

```bash
ldev deploy prepare
ldev deploy prepare --allow-running-env
```

`--allow-running-env` bypasses the guardrail that blocks `prepare` while Liferay is running. Use it only when you know why.

### `ldev deploy module`

Rebuild and deploy a single module or theme into `build/docker/deploy`.

```bash
ldev deploy module foo-web
```

### `ldev deploy all`

Rebuild and deploy every module in the repo.

```bash
ldev deploy all
```

Use `deploy module` first when the problem is isolated. Reach for `deploy all` only when a full rebuild is justified.

### `ldev deploy theme`

Rebuild and deploy a theme.

```bash
ldev deploy theme
ldev deploy theme --theme my-custom-theme
```

Default `--theme` is `ub-theme`.

### `ldev deploy service`

Run Service Builder and restore tracked `service.properties`.

```bash
ldev deploy service
```

### `ldev deploy watch`

Watch modules/themes and redeploy only the touched unit.

```bash
ldev deploy watch
ldev deploy watch --module foo-web
ldev deploy watch --interval 1500 --iterations 200
```

`--iterations 0` polls indefinitely; any other value is a hard limit useful for scripted runs.

### `ldev deploy status`

Show observed deploy artifacts and OSGi runtime state. Defaults to JSON.

```bash
ldev deploy status
```

### `ldev deploy cache-update`

Copy `build/docker/deploy` artifacts into `ENV_DATA_ROOT/liferay-deploy-cache`.

```bash
ldev deploy cache-update
ldev deploy cache-update --clean
```

`--clean` deletes cached artifacts before copying.
