---
title: Resource Migration Pipeline
description: Migrate journal articles when a structure changes — the workflow Liferay does not provide natively.
---

# Resource Migration Pipeline

Use this workflow when a structure change is risky because content already
exists.

This is one of the few `ldev` workflows that has no equivalent in Liferay
itself. Out of the box, Liferay has no native pipeline for migrating
articles when a journal structure changes — typical fixes involve manual
SQL, redoing content, or accepting data loss. `ldev` provides the missing
pipeline.

Examples it supports:

- remove a field
- rename a field
- split a structure into a safer schema
- update related templates while preserving existing content

## How it differs from a normal import

A normal import (see
[Export and Import Resources](/workflows/export-import-resources)) replaces
the structure definition. It does not move data inside articles that already
use that structure.

The migration pipeline reads a migration descriptor that defines:

- old structure → new structure mapping
- per-field actions (copy, rename, drop, default)
- whether old fields should be cleaned up after mapping
- which templates should be applied alongside the structure change

The descriptor is the source of truth for the migration plan.

## 1. Discover the current structure

```bash
ldev portal inventory structures --site /global --with-templates --json
```

Note the structure key you want to migrate.

## 2. Export the current resource state

```bash
ldev resource export-structure --site /global --structure MY_STRUCTURE
ldev resource export-templates --site /global
```

Commit these so the before-state is in Git history.

## 3. Generate the migration descriptor

```bash
ldev resource migration-init \
  --site /global \
  --structure MY_STRUCTURE \
  --templates
```

This creates a descriptor file under the configured migrations path. Edit
it: define the field mapping, decide whether to clean up old fields, list
the templates to apply.

## 4. Validate the pipeline without mutating content

```bash
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/global/MY_STRUCTURE.migration.json \
  --check-only \
  --migration-dry-run
```

Use this to review the plan and catch obvious problems early. The output
includes a `reasonBreakdown` per migrated structure with counters such as
`copiedToNewField`, `alreadyHadTargetValue`, `sourceEmpty`,
`noEffectiveChange`, and `sourceCleaned`.

## 5. Run the real pipeline deliberately

```bash
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/global/MY_STRUCTURE.migration.json
```

The descriptor is the source of truth. If you intend to execute the cleanup
phase as part of the real run, enable it explicitly:

```bash
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/global/MY_STRUCTURE.migration.json \
  --run-cleanup
```

Do not read this as a recommendation to run the pipeline twice in sequence.
After validation, choose one approved real execution plan and run it
deliberately with the flags that match.

## 6. Verify

Read the migrated structure back, and check a page that uses it:

```bash
ldev resource structure --site /global --structure MY_STRUCTURE
ldev portal inventory page --url /home --json
ldev logs diagnose --since 10m --json
```

## Recommended way to test

Test the migration against production-like data in an isolated branch
environment. This is exactly what `ldev worktree` is for:

```bash
ldev worktree setup --name migration-test --with-env
cd .worktrees/migration-test
ldev start
```

If `migration-test` already exists as a linked git worktree outside
`.worktrees/`, run `ldev worktree setup --with-env` from inside that
checkout instead of creating a second worktree.

Then run the full migration there before applying it elsewhere. See
[Worktrees](/advanced/worktrees) for the full model.

## Why this workflow exists

Liferay treats structures as immutable from the data side: articles are
locked to the structure version they were created against. Without a
pipeline like this, structural change either means writing custom SQL,
losing content, or migrating manually article by article.

`ldev resource migration-pipeline` is the workflow you would otherwise have
to build yourself.
