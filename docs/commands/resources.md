---
title: Resource Commands
description: Minimal reference for exporting, importing, and migrating Liferay resources as files.
---

# Resource Commands

## Read and inspect

```bash
ldev resource structure --site /global --key MY_STRUCTURE
ldev resource template --site /global --id MY_TEMPLATE
ldev resource adts --site /global
ldev resource adt --site /global --display-style ddmTemplate_33994
ldev resource fragments --site /global
```

Real examples:

```bash
ldev resource structure --key BASIC-WEB-CONTENT
ldev resource template --site /global --id MY_TEMPLATE
```

## Export

```bash
ldev resource export-structure --site /global --key MY_STRUCTURE
ldev resource export-structures --site /global
ldev resource export-template --site /global --key MY_TEMPLATE
ldev resource export-templates --site /global
ldev resource export-templates --all-sites
ldev resource export-adts --site /global
ldev resource export-adts --all-sites
ldev resource export-fragments --site /global
```

Use the `--all-sites` variants when you want a full export in one pass instead of going site by site.

Real output examples:

```text
EXPORTED mode=all-sites scanned=2 count=1
EXPORTED mode=all-sites scanned=2 exported=1 failed=0 dir=.../liferay/resources/journal/templates
```

## Import

```bash
ldev resource import-structure --file path/to/structure.json
ldev resource import-structures --check-only
ldev resource import-templates --check-only
ldev resource import-templates --apply
ldev resource import-structures --apply
ldev resource import-fragments
```

Use the import commands when you want file-based changes reviewed and replayed without the UI.

## Migration

```bash
ldev resource migration-init --site /global --key MY_STRUCTURE --templates
ldev resource migration-pipeline --migration-file path/to/MY_STRUCTURE.migration.json --check-only
ldev resource migration-pipeline --migration-file path/to/MY_STRUCTURE.migration.json
```

Use migration commands when structure changes affect existing content.

Use `migration-pipeline` as the default command for real migrations. It is the end-to-end workflow and is the safer choice for both humans and agents.

Use `migration-run` only when you intentionally need one phase in isolation, such as debugging, retrying only `introduce` or `cleanup`, or validating a specific stage without running the full pipeline.
