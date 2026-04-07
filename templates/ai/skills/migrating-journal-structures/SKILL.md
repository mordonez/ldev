---
name: migrating-journal-structures
description: "Use when a Journal structure or template change requires controlled data migration, staged validation or cleanup."
---

# Migrating Journal Structures

Use this skill when a structure change can affect existing content and must be
validated as a migration, not as a simple import.

## Required bootstrap

```bash
ldev context --json
ldev start
```

> `ldev context --json` returns `paths.migrations` and `paths.structures` — the
> local directories where descriptors and structure files are expected by default.

## Recommended workflow

### 1. Inspect current portal state

```bash
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
ldev resource structure --site /<site> --key <STRUCTURE_KEY> --json
ldev resource template --site /<site> --id <TEMPLATE_ID> --json
```

### 2. Scaffold a migration descriptor

Use `migration-init` to generate a base descriptor from the current portal state
before editing it by hand:

```bash
ldev resource migration-init --site /<site> --key <STRUCTURE_KEY>
```

Add `--templates` to include associated templates in the generated descriptor.
The output defaults to `paths.migrations/<site>/<key>.migration.json`.

Edit the descriptor to:

- Define explicit field mappings
- Limit the scope to one site and one structure
- Add an optional cleanup phase

When the migration introduces new fields or changes field types, use the field
type catalog to get the correct JSON shape for each field:

Reference: `developing-liferay/references/structure-field-catalog.md`

### 3. Validate before mutating

```bash
ldev resource migration-pipeline --migration-file <file> --check-only
```

For large changes, also dry-run content migration updates:

```bash
ldev resource migration-pipeline \
  --migration-file <file> \
  --check-only \
  --migration-dry-run
```

### 4. Run the introduce phase

```bash
ldev resource migration-pipeline --migration-file <file>
```

### 5. Run cleanup only after validation

```bash
ldev resource migration-pipeline --migration-file <file> --run-cleanup
```

## Validation checklist

- Structures and templates can still be discovered through `ldev portal inventory ...`.
- The migration pipeline completes without unexpected errors.
- `ldev logs --since 5m --service liferay --no-follow` stays clean enough to explain the outcome.
- If search behavior depends on migrated fields, verify reindex state with:

```bash
ldev portal reindex status --json
ldev portal reindex tasks --json
```

## Guardrails

- Never treat a live content migration as a plain import.
- Always keep a descriptor file under version control.
- Always use `migration-init` to scaffold the descriptor; do not write it from scratch.
- Always run `--check-only` before the real pipeline.
- Only run cleanup after functional validation of the introduced shape.
