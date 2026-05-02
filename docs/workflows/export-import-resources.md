---
title: Export and Import Resources
description: Manage structures, templates, ADTs and fragments as files instead of through the Liferay UI. The flagship ldev workflow.
---

# Export and Import Resources

This is the flagship `ldev` workflow.

In Liferay, structures, templates, ADTs and fragments live in the admin UI.
There is no clean, scriptable path to export them, review the change in Git,
and import them back. `ldev resource` is that path.

Use this workflow when content definitions should be reviewed, committed and
moved without depending on the UI.

## What you can manage as files

- journal structures
- journal templates
- application display templates (ADTs)
- fragments

## 1. Discover what exists

```bash
ldev portal inventory structures --site /global --with-templates --json
ldev portal inventory templates --site /global --json
```

Start with discovery so you know the exact site, key and object you are
exporting. `--with-templates` is the right starting point for any
structure/template work — it returns structures enriched with their
associated templates in one call.

## 2. Export from the portal

Export one structure:

```bash
ldev resource export-structure --site /global --structure MY_STRUCTURE
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

Real output examples:

```text
EXPORTED mode=all-sites scanned=2 count=1
EXPORTED mode=all-sites scanned=2 exported=1 failed=0 dir=.../liferay/resources/journal/templates
collections=0 fragments=0 scanned=2 mode=all-sites dir=.../liferay/fragments
```

Export ADTs and fragments scoped to a site:

```bash
ldev resource export-adts --site /global
ldev resource export-fragments --site /global
```

## 3. Review the files locally

Exported files live under the configured resource paths in your repo. Review
them like any other code change. Diff, commit, branch, PR — all the things
the UI never let you do.

## 4. Preview the import

Always preview before mutating:

```bash
ldev resource import-structures --check-only
ldev resource import-templates --check-only
```

`--check-only` reports what would change without writing anything.

## 5. Apply the import

```bash
ldev resource import-structures
ldev resource import-templates
```

Or apply the local directory contents directly:

```bash
ldev resource import-templates --apply
ldev resource import-structures --apply
```

Use the focused commands when you are changing one object only:

```bash
ldev resource import-structure --file liferay/resources/journal/structures/global/MY_STRUCTURE.json
ldev resource import-template --file liferay/resources/journal/templates/global/MY_TEMPLATE.ftl
```

Real output:

```json
{
  "mode": "single-site",
  "site": "/global",
  "processed": 1,
  "failed": 0,
  "failures": []
}
```

## 6. Verify with read-after-write

Do not stop at the import success message. Read the resource back and check
the page that depends on it:

```bash
ldev resource structure --site /global --structure MY_STRUCTURE
ldev portal inventory structures --site /global --with-templates --json
ldev portal inventory page --url /home --json
```

The end state is a resource change that is visible in Git, reproducible from
files, and verified by reading the portal back.

## When to use migration instead

If the structure change touches fields that already have content (renaming,
removing, splitting fields), a plain import is not enough. Use the
[Resource Migration Pipeline](/workflows/resource-migration-pipeline)
instead — it is the workflow Liferay does not have natively.
