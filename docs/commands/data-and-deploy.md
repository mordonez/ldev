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
