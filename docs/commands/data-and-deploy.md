---
title: Data and Deploy Commands
description: Minimal reference for production-to-local state transfer and local fix application.
---

# Data and Deploy Commands

## `ldev db sync`

Download and import a database backup from LCP.

```bash
ldev db sync --environment production --project my-lcp-project --force
```

This is the cloud-to-local shortcut: download from Liferay Cloud and import into local in one step.

## `ldev db files-download`

Download Document Library content from LCP.

```bash
ldev db files-download --environment production --project my-lcp-project
```

This command is specifically for Document Library content from Liferay Cloud backups.

## `ldev db files-mount`

Mount a local Document Library path into the runtime.

```bash
ldev db files-mount --path docker/doclib/production
```

Use this when the doclib path is local or was copied manually from outside Liferay Cloud.

## `ldev db import`

Import a local SQL backup into local PostgreSQL.

```bash
ldev db import --force
ldev db import --file /path/to/backup.sql.gz --force
```

Accepted backup types include `.sql`, `.gz`, and `.dump`.

## `ldev portal content prune`

Reduce oversized Journal content in a local portal after importing a large database.

```bash
ldev portal content prune --group-id 2710030 --root-folder 15588732 --keep 100 --dry-run
ldev portal content prune --site /guest --root-folder 12345 --keep 3 --keep-scope structure --dry-run
```

Default behavior keeps the most recent `N` items per folder. Use `--keep-scope structure` when the retention policy should be applied per structure across all selected folders.

Use `--dry-run` first and only apply the plan once the counts and sample items match the expected cleanup scope.

## `ldev portal inventory sites --with-content`

Inspect Journal content volume before deciding what to prune.

```bash
ldev portal inventory sites --with-content --sort-by content
ldev portal inventory sites --with-content --group-id 2710030 --limit 20
ldev portal inventory sites --site /facultat-farmacia-alimentacio --with-structures --limit 20
```

Without a site scope it lists the largest sites by estimated Journal volume. With `--site` or `--group-id` it lists the largest root folders in that site by subtree volume. Add `--with-structures` in scoped mode to include a per-folder Journal structure breakdown before deciding a prune.

Treat the global `--with-content --sort-by content` view as a fast radar. Use the scoped `--site` or `--group-id` mode when you need the exact folder and structure counts that should drive a `content prune`.

## `ldev deploy module`

Build and deploy one module or theme.

```bash
ldev deploy module foo-web
```

## `ldev deploy all`

Rebuild and deploy the current repo.

```bash
ldev deploy all
```

Use `deploy module` first when the problem is isolated.

## `ldev db download`

Download a database backup from Liferay Cloud into `docker/backups`.

```bash
ldev db download --environment prd --project my-lcp-project
```

`ldev db download` and `ldev db files-download` rely on the Liferay Cloud CLI (`lcp`) under the hood.
