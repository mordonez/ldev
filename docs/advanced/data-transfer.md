---
title: Data Transfer
description: Move database and Document Library state from Liferay Cloud (LCP) into a local environment for safe debugging.
---

# Data Transfer

Use these workflows when a clean local setup is not enough to reproduce the
issue.

> **LCP-aware:** `ldev db sync`, `ldev db download` and
> `ldev db files-download` pull from **Liferay Cloud (LCP)** specifically.
> They use the `lcp` CLI under the hood. For self-hosted production, use a
> backup you already have via `ldev db import --file <backup>` and move
> Document Library files manually with `ldev db files-mount`.

## Database (LCP)

```bash
ldev db sync --environment production --project my-lcp-project --force
```

This replaces the current local database with a selected LCP backup.
Requires the LCP CLI installed and authenticated.

## Database (any source)

```bash
ldev db import --file /path/to/backup.sql.gz --force
```

Works with any local `.sql`, `.gz`, or `.dump` file — LCP-originated or
not.

## Document Library (LCP)

```bash
ldev db files-download \
  --environment production \
  --project my-lcp-project \
  --doclib-dest docker/doclib/production

ldev db files-mount --path docker/doclib/production
```

Do this when the incident depends on documents, media, or file-backed
content stored in LCP.

## Document Library (manual)

If your file store is outside LCP, move it manually and mount it yourself:

```bash
ldev db files-mount --path /path/to/manual/doclib
```

## Verify after transfer

```bash
ldev start
ldev doctor
ldev portal inventory page --url /home --json
```

The goal is a production-like local environment that you can inspect and
fix safely.
