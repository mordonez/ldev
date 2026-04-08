---
title: Export and Import Resources
description: Manage structures, templates, ADTs, and fragments as files instead of through the Liferay UI.
---

# Export and Import Resources

Use this workflow when content definitions should be reviewed, committed, and moved without depending on the UI.

`ldev resource` is one of the main differentiators of the CLI.

## What you can manage as files

- journal structures
- journal templates
- application display templates
- fragments

## 1. Discover what exists

```bash
ldev portal inventory structures --site /global --json
ldev portal inventory templates --site /global --json
```

Start with discovery so you know the exact site, key, and object you are exporting.

## 2. Export from the portal

Export one structure:

```bash
ldev resource export-structure --site /global --key MY_STRUCTURE
```

Export all structures and templates:

```bash
ldev resource export-structures --site /global
ldev resource export-templates --site /global
```

Export everything in one pass:

```bash
ldev resource export-structures --all-sites
ldev resource export-templates --all-sites
ldev resource export-adts --all-sites
ldev resource export-fragments --all-sites
```

Real examples:

```text
EXPORTED mode=all-sites scanned=2 count=1
EXPORTED mode=all-sites scanned=2 exported=1 failed=0 dir=.../liferay/resources/journal/templates
collections=0 fragments=0 scanned=2 mode=all-sites dir=.../liferay/fragments
```

Export ADTs and fragments:

```bash
ldev resource export-adts --site /global
ldev resource export-fragments --site /global
```

## 3. Review the files locally

The exported files live in the configured resource paths in your repo. Review them like any other code change.

## 4. Import back safely

Validate first:

```bash
ldev resource import-structures --check-only
ldev resource import-templates --check-only
```

Apply when ready:

```bash
ldev resource import-structures
ldev resource import-templates
```

If you want to apply the local directory contents directly:

```bash
ldev resource import-templates --apply
ldev resource import-structures --apply
```

Real example:

```json
{
  "mode": "single-site",
  "site": "/global",
  "processed": 1,
  "failed": 0,
  "failures": []
}
```

Use the focused commands when you are changing one object only:

```bash
ldev resource import-structure --file liferay/resources/journal/structures/global/MY_STRUCTURE.json
ldev resource import-template --file liferay/resources/journal/templates/global/MY_TEMPLATE.ftl
```

## 5. Verify

```bash
ldev portal inventory structures --site /global --json
ldev portal inventory page --url /home --json
```

The end state is a resource change that is visible in Git and reproducible without manual clicking.
