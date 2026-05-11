---
name: portal-resource-workflow
description: 'Changes Liferay portal resources through the canonical ldev file-backed workflow. Use when editing Journal structures, Journal templates, ADTs, or fragments.'
---

# Portal Resource Workflow

Owns the canonical file-backed workflow for structures, templates, ADTs, and
fragments. Deploy commands do not apply these resources.

## 1. Resolve Origin

Start from runtime evidence, not grep. Use the full page inventory contract in
[../../docs/PORTAL_DISCOVERY.md](../../docs/PORTAL_DISCOVERY.md).

For cross-site ambiguity:

```bash
ldev portal inventory structures --with-templates --all-sites --json
```

Resolve the source-of-truth site before editing. If several site folders contain
the same key, sibling copies are out of scope until inventory, project context,
or the user proves they are active.

## 2. Export Before Editing

Use focused singular exports:

```bash
ldev resource export-structure --site /<site> --structure <KEY>
ldev resource export-template --site /<site> --template <KEY>
ldev resource export-adt --site /<site> --adt <KEY> --widget-type <type>
ldev resource export-fragment --site /<site> --fragment <KEY>
```

## 3. Decide Import vs Migration

Use plain import only when existing content remains readable without moving,
renaming, changing type, nesting, or cleaning up saved fields.

Switch to `migrating-journal-structures` when a structure change moves existing
values, converts repeatability, renames fields, changes field types, or must
preserve existing values in a new location.

If the issue asks to make an existing field or field pair repeatable, ask
whether saved values must migrate into the new repeatable shape or stay in
legacy fields with additive extra fields.

When editing a Journal structure, every new field must also be placed in
`defaultDataLayout` at the requested visual position.

## 4. Validate And Apply

Use the mutation gates in
[../../docs/RESOURCE_MUTATION_GATES.md](../../docs/RESOURCE_MUTATION_GATES.md).

Apply the smallest matching import:

```bash
ldev resource import-structure --liferay-timeout-seconds 300 --site /<site> --structure <KEY>
ldev resource import-template --liferay-timeout-seconds 300 --site /<site> --template <KEY>
ldev resource import-adt --site /<site> --file <path>
ldev resource import-fragment --site /<site> --fragment <KEY>
```

## 5. Prove Green

- Read back the changed resource with `ldev resource structure/template/adt` or
  a focused export.
- Run `ldev portal check --json` and `ldev logs diagnose --since 5m --json`.
- For visible behavior, validate the affected local URL in the browser.
- For structure authoring changes, prove both existing-content visibility and a
  saved new-content scenario that exercises the new field shape. Editor labels
  or duplicate buttons alone are not Green.

Do not claim Green from import success alone.
