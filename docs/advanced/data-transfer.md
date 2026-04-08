---
title: Data Transfer
description: Move database and document-library state from Liferay Cloud into a local environment for safe debugging.
---

# Data Transfer

Use these workflows when a clean local setup is not enough to reproduce the issue.

## Database

```bash
ldev db sync --environment production --project my-lcp-project --force
```

This replaces the current local database with a selected LCP backup.

## Document Library

```bash
ldev db files-download \
  --environment production \
  --project my-lcp-project \
  --doclib-dest docker/doclib/production

ldev db files-mount --path docker/doclib/production
```

Do this when the incident depends on documents, media, or file-backed content.

## Verify after transfer

```bash
ldev start
ldev doctor
ldev portal inventory page --url /home --json
```

The goal is a production-like local environment that you can inspect and fix safely.
