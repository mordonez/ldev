---
name: migrating-journal-structures
description: 'Runs controlled Journal structure/template migrations with descriptor-backed validation. Use when existing Journal content must move across structures, be renamed, change type, or preserve existing content in a new location — not for same-structure reorganizations that Liferay handles automatically.'
---

# Migrating Journal Structures

> **Prerequisites:** [`ldev-shared`](../ldev-shared/SKILL.md), [`isolating-worktrees`](../isolating-worktrees/SKILL.md)

Use when a Journal structure change requires migration Liferay cannot handle automatically.
Plain imports cover more than additive-only changes — read the Hard Gate first.

## Hard Gate

Before editing a Journal structure, classify the change:

- **Additive or same-structure reorganization** (plain `import-structure`): adding optional
  fields, or nesting existing fields into a new fieldset within the same structure with the
  same `name` values. Liferay remaps `parentfieldid` to preserve existing content automatically.
  Condition: `name` unchanged, same structure, update via `import-structure` not direct DB.
- **Migration-required** (`migration-init is mandatory`): any rename, type change,
  cross-structure movement, repeatability conversion where existing saved values must
  migrate into the new repeatable shape, legacy field cleanup, or content transformation.

Do not hand-write the descriptor from scratch, do not rely on `import-structure` alone,
and do not continue without a pipeline plan.

If the issue asks to make an existing field or field pair repeatable, ask whether
saved values must migrate into the new repeatable shape (migration-required) or a
same-structure wrapper with unchanged `name` values suffices (plain import).

Existing-content and new-content validation are both required.

## Bootstrap

```bash
ldev ai bootstrap --intent=migrate-resources --json
```

Required fields: `context.paths.resources.migrations`, `context.paths.resources.structures`, and `context.liferay.auth.oauth2.*.status`. If any are missing, stop — the installed `ldev` AI assets are out of sync with the CLI; do not proceed.

## Pipeline

1. Inspect portal state: `ldev portal inventory structures` and `ldev resource structure`.

2. Scaffold, then edit the descriptor:

```bash
ldev resource migration-init --site /<site> --structure <STRUCTURE_KEY>
```

Set `introduce.articleIds` to the article under test. Do not scan the whole
site first unless approved. Do not pass `--templates` for a data-only migration.

3. Validate before mutating:

```bash
ldev resource migration-pipeline --migration-file <file> --check-only
```

4. Run deliberately:

```bash
ldev resource migration-pipeline --migration-file <file>
```

First proof is non-destructive: keep legacy fields in the schema, run
introduce-only on scoped `articleIds`, and use no cleanup. Removing legacy
fields, removing fallbacks, `cleanupSource=true`, or `--run-cleanup` requires a
separate user-confirmed step after read-after-write and render proof.

For descriptor fields, mappings, dry-runs, and validation details, read `references/pipeline.md`.

## Done When

- Migration pipeline completes without unexpected errors.
- Read-after-write confirms the target structure and templates.
- Existing-content validation confirms old saved values remain visible.
- New-content validation saves local content with at least two repeated entries
  and confirms all entries render.
- Fresh logs are clean enough to explain the outcome.

## Guardrails

- Do not claim Green from structure import alone.
- Do not use `import-structure --migration-plan` as the normal path.
- Always keep a descriptor file under version control.
- Always scope the first validation descriptor with `introduce.articleIds`.
- Always run `--check-only` before the real pipeline.
- Ask explicit user confirmation before legacy cleanup/removal.
- Use `--liferay-timeout-seconds 300` on real structure/template/pipeline mutations; still read back.
- Do not document migration-pipeline as a mandatory two-run sequence.
- Treat `--check-only` as plan validation, not persistence proof.
- Use `../developing-liferay/references/structure-field-catalog.md`.

## See Also

- [`portal-resource-workflow`](../portal-resource-workflow/SKILL.md) — for additive or same-structure changes that do not require migration
- [`recipe-resource-import-and-verify`](../recipe-resource-import-and-verify/SKILL.md) — for the import + verify loop after migration completes
