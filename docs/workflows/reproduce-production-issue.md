---
title: Reproduce a Production Issue Locally
description: Bring production state into a local Liferay environment so you can debug and verify changes safely.
---

# Reproduce a Production Issue Locally

This is one of the main reasons to use `ldev`.

When production is failing, do not guess from screenshots or copy stack traces into chat. Recreate the state locally, inspect it, fix it there, and verify the result before production changes.

## Problem

Production shows a page failure or content issue that you cannot reproduce with clean local data.

## 1. Pull the production database locally

```bash
ldev db sync --environment production --project my-lcp-project --force
```

`--force` replaces the current local PostgreSQL data so the environment matches the selected backup.

If you already have a local `.sql`, `.gz`, or `.dump` file, you can skip the cloud download and import it directly:

```bash
ldev db import --file /path/to/backup.sql.gz --force
```

## 2. Pull the production Document Library

```bash
ldev db files-download \
  --environment production \
  --project my-lcp-project \
  --doclib-dest docker/doclib/production

ldev db files-mount --path docker/doclib/production
```

Do this when the issue involves documents, images, or content linked from the Document Library.

If the file store is outside Liferay Cloud, move it manually and mount it yourself:

```bash
ldev db files-mount --path /path/to/manual/doclib
```

## 3. Start the local environment

```bash
ldev start
ldev doctor
```

You now have a local environment close enough to production state to debug without touching production users.

## 4. Discover the affected portal area

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
```

This is often faster than clicking through the UI, especially when the UI is already failing.

## 5. Diagnose the issue

```bash
ldev logs diagnose --since 15m --json
ldev osgi diag com.acme.foo.web
```

Use whichever command matches the failure signal you found.

## 6. Apply the fix locally

```bash
ldev deploy module foo-web
```

Or update the portal/resource/config state in the repo, then restart:

```bash
ldev env restart
```

## 7. Verify locally before any production action

```bash
ldev portal check
ldev portal inventory page --url /home --json
ldev logs diagnose --since 5m --json
```

This is the safety loop:

1. reproduce production locally
2. diagnose with local access
3. apply the fix safely
4. verify with the same commands
