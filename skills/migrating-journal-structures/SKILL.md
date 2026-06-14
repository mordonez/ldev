---
name: migrating-journal-structures
description: 'Runs controlled Journal structure/template migrations with descriptor-backed validation. Use when existing Journal content may be moved, renamed, converted, cleaned up, or must preserve existing content in a new field shape.'
---

# Migrating Journal Structures

Use when a Journal structure change can affect saved content. Plain imports are
only for compatible additive changes handled by `portal-resource-workflow`.

## Hard Gate

Before editing a Journal structure, classify the change:

- Additive-only and content-compatible: optional new fields or fieldsets, no
  renames, no type changes, no movement/nesting of existing fields, no cleanup.
- Migration-required: any rename, type change, nesting/movement, repeatability
  conversion, cleanup of legacy fields, or requirement that existing values
  appear in a new field location.

For migration-required changes, `migration-init is mandatory`. Do not hand-write
the descriptor from scratch, do not rely on `import-structure`, and do not
continue without a pipeline plan.

If the issue asks to make an existing field or field pair repeatable, ask
whether saved values must migrate into the new repeatable shape or stay in
legacy fields with additive extra fields.

Existing-content and new-content validation are both required.

## Bootstrap

```bash
ldev ai bootstrap --intent=migrate-resources --json
```

Required fields: `context.paths.resources.migrations`, `context.paths.resources.structures`, and `context.liferay.auth.oauth2.*.status`.

If any are missing, report that installed `ldev` AI assets are out of sync.

## Isolation

Never run migrations against the main environment. Use `isolating-worktrees`
first, lock the root, start the worktree runtime, and reproduce there.

## Pipeline

1. Inspect portal state with `portal inventory structures` and
   `resource structure`.

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

## Minimum Green

- Migration pipeline completes without unexpected errors.
- Read-after-write confirms the target structure and templates.
- Existing-content validation confirms old saved values remain visible.
- New-content validation saves local content with at least two repeated entries
  and confirms all entries render.
- Fresh logs are clean enough to explain the outcome.

## Guardrails

- Use MCP only for read-only inventory/diagnosis.
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
