---
title: Resource Migration Pipeline
description: Plan and run safe structure migrations when content already exists.
---

# Resource Migration Pipeline

Use this workflow when a structure change is risky because content already exists.

Examples:

- remove a field
- rename a field
- split a structure into a safer schema
- update related templates while preserving existing content

## Why use the pipeline

This is not the same as a normal import.

When data already exists, you need a migration descriptor that defines how the change should be applied, including whether old fields should be cleaned up.

## 1. Discover the current structure

```bash
ldev portal inventory structures --site /global --json
```

Note the structure key you want to migrate.

## 2. Export the current resource state

```bash
ldev resource export-structure --site /global --key MY_STRUCTURE
ldev resource export-templates --site /global
```

## 3. Generate the migration descriptor

```bash
ldev resource migration-init \
  --site /global \
  --key MY_STRUCTURE \
  --templates
```

This creates a descriptor under the configured migrations path. Edit it before running anything.

## 4. Validate the pipeline without mutating content

```bash
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/global/MY_STRUCTURE.migration.json \
  --check-only \
  --migration-dry-run
```

Use this to review the plan and catch obvious problems early.

## 5. Run the migration

```bash
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/global/MY_STRUCTURE.migration.json
```

The descriptor is the source of truth. If it says old fields should be removed, that cleanup is part of the migration plan itself.

## 6. Verify

```bash
ldev portal inventory page --url /home --json
ldev logs diagnose --since 10m --json
```

## Recommended way to test

Test the migration against production-like data in an isolated branch environment:

```bash
ldev worktree setup --name migration-test --with-env
cd .worktrees/migration-test
ldev start
```

Then run the migration there first.
