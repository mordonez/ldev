---
title: Resource Commands
description: Minimal reference for exporting, importing, and migrating Liferay resources as files.
---

# Resource Commands

The `ldev resource` namespace treats structures, templates, ADTs and fragments as reviewable files. Every subcommand supports `--json`/`--ndjson` and the root accepts `--preflight` to check API surface reachability before running.

```bash
ldev resource --preflight export-structures --all-sites
```

## Read and inspect

```bash
ldev resource structure --site /global --structure BASIC-WEB-CONTENT
ldev resource template --site /global --template MY_TEMPLATE
ldev resource adts --site /global
ldev resource adt --site /global --display-style ddmTemplate_33994
ldev resource fragments --site /global
```

- `structure` — accepts `--structure`
- `template` — `--template` accepts id, key, ERC or visible name
- `adt` — filter by `--adt`, `--id`, `--name`, `--display-style`, `--widget-type`, or explicit `--class-name`
- `adts` — list all ADTs for a site; add `--include-script` to include template scripts in JSON
- `fragments` — list fragment collections and entries for a site

## Export

```bash
ldev resource export-structure --site /global --structure MY_STRUCTURE
ldev resource export-structures --site /global
ldev resource export-structures --all-sites --check-only
ldev resource export-template --site /global --template MY_TEMPLATE
ldev resource export-templates --all-sites --continue-on-error
ldev resource export-adt --site /global --adt MY_ADT --widget-type asset-publisher
ldev resource export-adts --all-sites
ldev resource export-fragment --fragment BASIC_COMPONENT-paragraph --site /global
ldev resource export-fragments --all-sites
```

Key flags:

- `--all-sites` — export from every accessible site in one pass
- `--check-only` (structures/templates export) — report diffs against local files without writing them
- `--continue-on-error` — do not abort the whole export if one entry fails
- `--dir <dir>` — override the default destination path resolved from `.liferay-cli.yml`

## Import

```bash
ldev resource import-structure --file path/to/structure.json --structure MY_STRUCTURE --check-only
ldev resource import-structure --file path/to/structure.json --structure MY_STRUCTURE --create-missing
ldev resource import-template --template MY_TEMPLATE --file path/to/template.ftl
ldev resource import-adt --file path/to/adt.ftl --create-missing
ldev resource import-fragment --fragment BASIC_COMPONENT-paragraph
ldev resource import-fragments --all-sites
ldev resource import-structures --check-only
ldev resource import-templates --apply
ldev resource import-adts --apply --continue-on-error
```

Common flags on plural imports:

- `--apply` — import every local item for the resolved site
- `--all-sites` — import for every local site directory
- `--structure <key>` / `--template <key>` / `--adt <key>` — repeatable, scoped imports
- `--check-only` — preview only, do not mutate
- `--create-missing` — create the resource when it does not exist
- `--continue-on-error` — do not stop the batch on a single failure

Structure imports additionally accept the migration options:

- `--migration-plan <file>` — attach a migration descriptor
- `--migration-phase pre|post|both`
- `--migration-dry-run` — do not persist structured content migration changes
- `--cleanup-migration` — blank the source fields after mapping them
- `--allow-breaking-change` — allow field removals without a migration plan
- `--skip-update` — validate only, do not update the structure definition

## Migration

```bash
ldev resource migration-init --site /global --structure MY_STRUCTURE --templates
ldev resource migration-pipeline --migration-file path/to/MY_STRUCTURE.migration.json --check-only --migration-dry-run
ldev resource migration-pipeline --migration-file path/to/MY_STRUCTURE.migration.json
ldev resource migration-pipeline --migration-file path/to/MY_STRUCTURE.migration.json --run-cleanup
ldev resource migration-run --migration-file path/to/MY_STRUCTURE.migration.json --stage introduce
```

Use `migration-pipeline` as the default command for real migrations — it is the full validated workflow. Use `migration-run` only when you need to execute one stage in isolation (debugging, retrying, validating a single phase).

The migration output includes a `reasonBreakdown` per migrated structure with counters for:

- `copiedToNewField`
- `alreadyHadTargetValue`
- `sourceEmpty`
- `noEffectiveChange`
- `sourceCleaned`

Progress messages localize title updates and report per-structure progress so large runs remain readable.

Flags worth remembering:

- `migration-pipeline --check-only --migration-dry-run` is the safest validation path
- `migration-pipeline --run-cleanup` runs the cleanup phase defined in the same descriptor
- `migration-pipeline --skip-validation` skips the final check-only pass
- `migration-pipeline --create-missing-templates` creates descriptor templates when absent
- `migration-run --stage introduce|cleanup` picks one phase only

See the [Resource Migration Pipeline workflow](/workflows/resource-migration-pipeline) for an end-to-end example.
