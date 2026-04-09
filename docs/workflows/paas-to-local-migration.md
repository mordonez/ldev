---
title: PaaS to Local Migration
description: Bring a Liferay Cloud environment into local so you can debug, sanitize, and verify changes safely.
---

# PaaS to Local Migration

Use this workflow when the real issue lives in Liferay Cloud and a clean local setup is not enough.

This is a practical production-to-local flow:

1. download the database backup from Liferay Cloud
2. import it locally
3. optionally pull the Document Library
4. start local
5. diagnose and fix there first

## 1. Download the database from Liferay Cloud

```bash
ldev db download --environment prd --project my-lcp-project
```

`ldev db download` uses the Liferay Cloud CLI (`lcp`) under the hood and stores the backup under `docker/backups`.

## 2. Import it into local PostgreSQL

```bash
ldev db import --force
```

This does not require Liferay Cloud if you already have a physical backup file. You can import a local `.sql`, `.gz`, or `.dump` file directly:

```bash
ldev db import --file /path/to/backup.sql.gz --force
```

## 3. Optionally download the Document Library from Liferay Cloud

```bash
ldev db files-download \
  --environment prd \
  --project my-lcp-project \
  --doclib-dest docker/doclib/production
```

`db files-download` is specifically for Document Library content from Liferay Cloud backups.

If your files are not in Liferay Cloud, move them manually and mount them yourself:

```bash
ldev db files-mount --path /path/to/manual/doclib
```

## 4. Start and inspect

```bash
ldev start
ldev doctor
ldev portal check
```

If the imported dataset is too large for practical local work, inspect the site inventory first so you can decide what to prune:

```bash
ldev portal inventory sites --site /actualitat --with-structures --limit 20
```

This scoped inventory is the exact view to use before pruning. For the full command reference and output semantics, see [Data and Deploy Commands](/commands/data-and-deploy).

Once you know which folders are oversized, run a dry-run prune:

```bash
ldev portal content prune --group-id 2710030 --root-folder 15588732 --keep 100 --dry-run
```

Apply only after checking the dry-run summary.

## 5. Diagnose and fix locally

```bash
ldev logs diagnose --since 15m --json
ldev portal inventory page --url /home --json
ldev osgi diag com.acme.foo.web
ldev deploy module foo-web
```

## 6. Verify before production action

```bash
ldev portal check
ldev logs diagnose --since 5m --json
```

This is the main safety benefit of `ldev`: you can turn a cloud incident into a local, testable workflow.
