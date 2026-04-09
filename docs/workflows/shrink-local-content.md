---
title: Shrink Local Content
description: Reduce oversized Journal content after a database import so the local portal stays usable.
---

# Shrink Local Content

Use this workflow after `ldev db sync` or `ldev db import` when local Journal content volume is too large for practical reindexing or day-to-day use.

`ldev portal content prune` keeps the portal data model intact while reducing the number of Journal articles through Liferay APIs instead of manual SQL.

## 1. Inspect the portal first

```bash
ldev portal check
ldev portal inventory sites --json
ldev portal inventory sites --with-content --sort-by content
```

Resolve the exact site and folder ids before deleting anything.

To inspect the largest root folders in one site:

```bash
ldev portal inventory sites --with-content --group-id 2710030 --limit 20
```

## 2. Preview the cleanup

Keep the most recent items per folder:

```bash
ldev portal content prune \
  --group-id 2710030 \
  --root-folder 15588732 \
  --root-folder 30502509 \
  --keep 100 \
  --dry-run
```

Keep the most recent items per structure across all selected folders:

```bash
ldev portal content prune \
  --group-id 2739584 \
  --root-folder 2987332 \
  --root-folder 2987326 \
  --keep 3 \
  --keep-scope structure \
  --dry-run
```

Review:

- `folderCount`
- `articleCount`
- `keptCount`
- `deletedCount`
- `Breakdown by structure`
- `Folders planned for removal`

## 3. Apply when the plan looks correct

```bash
ldev portal content prune \
  --group-id 2710030 \
  --root-folder 15588732 \
  --root-folder 30502509 \
  --keep 100
```

The command deletes articles first and only removes folders that end up empty.

## 4. Verify the reduced local dataset

```bash
ldev portal check
ldev logs diagnose --since 5m --json
```

This workflow is intended for local sanitation after importing a large database, not for editorial cleanup in shared environments.
