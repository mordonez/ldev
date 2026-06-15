---
name: portal-resource-workflow
description: 'Changes Liferay portal resources through the canonical ldev file-backed workflow. Use when editing Journal structures, Journal templates, ADTs, or fragments.'
---

# Portal Resource Workflow

Owns the canonical file-backed workflow for structures, templates, ADTs, and
fragments. Deploy commands do not apply these resources.

## 1. Resolve Origin

Start from runtime evidence, not grep. Use the full page inventory contract in
[references/portal-discovery.md](references/portal-discovery.md).

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

**Plain `import-structure` is sufficient when:**
- Adding optional new fields or fieldsets (additive).
- Moving or nesting existing fields into a new fieldset **within the same
  structure** while keeping their `name` values unchanged — Liferay's DDM
  service remaps `parentfieldid` automatically for all existing content when
  the structure is updated through the portal API.

**Switch to `migrating-journal-structures` when:**
- Data must appear in a field that belongs to a **different structure**
  (cross-structure migration).
- Any field `name` changes (rename).
- Any field type changes.
- Existing saved values must appear inside a new repeatable shape
  (repeatability conversion).
- Legacy fields must be cleaned up or removed.
- Content requires transformation (split, merge, format conversion).

If the issue asks to make an existing field or field pair repeatable, clarify
the goal first: a same-structure fieldset wrapper (same `name` values) is a
plain import — Liferay handles it automatically. Only route to
`migrating-journal-structures` when saved values must appear at a new field
path in a different structure or under a renamed field.

When editing a Journal structure, every new field must also be placed in
`defaultDataLayout` at the requested visual position.

## 4. Validate And Apply

Use the mutation gates in
[references/resource-mutation-gates.md](references/resource-mutation-gates.md).

Apply the smallest matching import:

```bash
ldev resource import-structure --liferay-timeout-seconds 300 --site /<site> --structure <KEY>
ldev resource import-template --liferay-timeout-seconds 300 --site /<site> --template <KEY>
ldev resource import-adt --site /<site> --file <path> --widget-type <type>
ldev resource import-fragment --site /<site> --fragment <KEY>
```

On Windows, run `/site` arguments from PowerShell argv arrays or set
`MSYS_NO_PATHCONV=1` in Git Bash. A rewritten value like
`C:/Program Files/Git/<site>` is shell path conversion, not a Liferay site.

For fragments, a read-back/hash mismatch is not a request to update a checksum
file. It means the runtime content returned after import differs from the local
fragment source; verify the active source directory, key, site, and normalized
html/css/js/configuration before changing anything else. Do not search hidden
ldev/editor caches or `fragment.json` for a hash, and do not look for a force
flag.

## 5. Prove Green

- Read back the changed resource with `ldev resource structure/template/adt` or
  a focused export.
- Run `ldev portal check --json` and `ldev logs diagnose --since 5m --json`.
- For visible behavior, validate the affected local URL in the browser.
- For structure authoring changes, prove both existing-content visibility and a
  saved new-content scenario that exercises the new field shape. Editor labels
  or duplicate buttons alone are not Green.

Do not claim Green from import success alone.
