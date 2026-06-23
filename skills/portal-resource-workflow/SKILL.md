---
name: portal-resource-workflow
description: 'Changes Liferay portal resources through the canonical ldev file-backed workflow. Use when editing Journal structures, Journal templates, ADTs, or fragments.'
---

# Portal Resource Workflow

> **Prerequisite:** [`ldev-shared`](../ldev-shared/SKILL.md)

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

## Done When

- Imported resource reads back from the portal matching the expected change.
- `ldev portal check --json` and `ldev logs diagnose --since 5m --json` are clean.
- Browser validation passes for any visible behavior change.
- For structure authoring changes: both existing-content visibility and a new-content scenario with the new field shape are proven.

## Guardrails

- Always export the current version before editing — never edit a local file you haven't exported first.
- Always run `--check-only` before any resource import.
- Do not use deploy commands for structures, templates, ADTs, or fragments.
- Resolve origin site from the portal inventory before editing. Do not assume from filesystem layout.
- For cross-site ambiguity, resolve the source-of-truth site before touching any file.
- On Windows, set `MSYS_NO_PATHCONV=1` in Git Bash to prevent `/site` path conversion.
- A fragment read-back/hash mismatch means the runtime content differs from local source; verify source directory, key, site, and normalized html/css/js before changing anything else.
- Always place new Journal structure fields in `defaultDataLayout` at the requested visual position. Editor labels or duplicate buttons alone are not Green — prove a saved new-content scenario.

## See Also

- [`recipe-resource-import-and-verify`](../recipe-resource-import-and-verify/SKILL.md) — recipe for the focused import + verify loop
- [`recipe-sync-codebase-from-portal`](../recipe-sync-codebase-from-portal/SKILL.md) — recipe for exporting all resources from a restored prod DB
- [`migrating-journal-structures`](../migrating-journal-structures/SKILL.md) — for field renames, type changes, and cross-structure moves
