---
title: PaaS to Local Migration
description: Bring a Liferay Cloud (LCP) environment into a local setup so you can debug, sanitise and verify changes safely.
---

# PaaS to Local Migration

Use this workflow when the real issue lives in **Liferay Cloud (LCP)** and
a clean local setup is not enough.

`ldev` provides the LCP-specific data-transfer commands. For self-hosted
production, see [Reproduce a Production Issue
Locally](/workflows/reproduce-production-issue).

The end-to-end flow:

1. download the database backup from LCP
2. import it locally
3. optionally pull the Document Library
4. start local
5. triage and fix there first

## 1. Download the database from LCP

```bash
ldev db download --environment prd --project my-lcp-project
```

`ldev db download` uses the LCP CLI (`lcp`) under the hood and stores the
backup under `docker/backups`. You need the LCP CLI installed and
authenticated, and `LCP_PROJECT` / `LCP_ENVIRONMENT` set (typically in
`docker/.env`).

## 2. Import it into local PostgreSQL

```bash
ldev db import --force
```

`--force` replaces the current local PostgreSQL data. `db import` does not
require LCP — you can also import any local `.sql`, `.gz`, or `.dump`
file:

```bash
ldev db import --file /path/to/backup.sql.gz --force
```

## 3. (Optionally) download the Document Library from LCP

```bash
ldev db files-download \
  --environment prd \
  --project my-lcp-project \
  --doclib-dest docker/doclib/production
```

If your files are not in LCP, move them manually and mount them yourself:

```bash
ldev db files-mount --path /path/to/manual/doclib
```

## 4. Start and inspect

```bash
ldev start
ldev doctor
ldev portal check
```

If the imported dataset is too large for practical local work, inspect the
site inventory first so you can decide what to prune:

```bash
ldev portal inventory sites --site /actualitat --with-structures --limit 20
```

This scoped inventory is the exact view to use before pruning. For the
full command reference, see
[Data and Deploy Commands](/commands/data-and-deploy).

Once you know which folders are oversized, run a dry-run prune:

```bash
ldev portal content prune --group-id 2710030 --root-folder 15588732 --keep 100 --dry-run
```

Apply only after checking the dry-run summary. If this becomes a repeated
step in your local incident workflow, see
[Shrink Local Content](/workflows/shrink-local-content).

## 5. Triage and fix locally

```bash
ldev logs diagnose --since 15m --json
ldev portal inventory page --url /home --json
ldev osgi diag com.acme.foo.web
ldev deploy module foo-web
```

## 6. Verify before any production action

```bash
ldev portal check
ldev logs diagnose --since 5m --json
```

The safety benefit of `ldev` here is concrete: a cloud incident becomes a
local, testable workflow.
