---
name: recipe-sync-codebase-from-portal
description: 'Exports all portal resources from a running local portal (typically after restoring a production DB) into the local codebase. Use when the portal is the source of truth and the local files are stale.'
---

# Recipe: Sync Codebase from Portal

> **Prerequisites:** [`ldev-shared`](../ldev-shared/SKILL.md), [`portal-resource-workflow`](../portal-resource-workflow/SKILL.md)

## When to Use

The portal is the source of truth — resources (structures, templates, ADTs, fragments) live in runtime and were deployed manually to production. After restoring a production DB locally, the codebase files are stale. This recipe exports the runtime state back into local files so the codebase reflects what is actually deployed.

Do not use this recipe to push local changes into the portal — that is `recipe-resource-import-and-verify`.

## Steps

### 1. Confirm portal is running with the restored data

```bash
ldev status --json
ldev doctor --portal --json
```

If the portal is not reachable, start it and wait for it to be healthy before continuing.

```bash
ldev start
ldev doctor --portal --json
```

### 2. Discover all sites and resource inventory

```bash
ldev portal inventory sites --json
ldev portal inventory structures --all-sites --json
ldev portal inventory templates --all-sites --json
```

Use the inventory output to build the list of (site, key) pairs to export. Do not guess keys from the local filesystem — derive them from the running portal.

### 3. Export resources per site

Run focused singular exports for each resource type and site identified in step 2:

```bash
# Structures
ldev resource export-structure --site /<site> --structure <KEY> --json

# Templates
ldev resource export-template --site /<site> --template <KEY> --json

# ADTs
ldev resource export-adt --site /<site> --adt <KEY> --widget-type <type> --json

# Fragments
ldev resource export-fragment --site /<site> --fragment <KEY> --json
```

Work site by site, resource type by resource type. Do not batch across sites in a single command unless `--all-sites` is explicitly supported and the intent is clear.

### 4. Review the diff

```bash
git diff --stat
```

Inspect which files changed. Unexpected changes (keys you did not intend to touch) indicate either the portal has diverged further than expected or the inventory step missed a site boundary. Review before committing.

### 5. Verify the portal is still healthy after the export operations

```bash
ldev portal check --json
ldev logs diagnose --since 10m --json
```

Export operations are read-only, but this confirms the portal state was not disturbed.

## Done When

- Every (site, key) pair from the inventory has a corresponding local file.
- `git diff` shows only the expected resource updates — no orphaned or unexpected files.
- `ldev portal check` is green.

## Guardrails

- Export is read-only. This recipe never writes to the portal.
- If a resource key appears in the portal but not in the local codebase, create the file via export — do not create it manually.
- If the inventory reveals resources on unexpected sites, surface this to the user before exporting — it may indicate a misconfigured portal or a multi-site ambiguity.
