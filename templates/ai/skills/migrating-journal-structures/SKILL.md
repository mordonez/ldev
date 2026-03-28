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

## Recommended workflow

### 1. Inspect current portal state

```bash
ldev liferay inventory structures --site /<site> --json
ldev liferay inventory templates --site /<site> --json
ldev liferay resource structure --site /<site> --key <STRUCTURE_KEY> --json
ldev liferay resource template --site /<site> --id <TEMPLATE_ID> --json
```

### 2. Prepare a migration descriptor

Create a descriptor file in the project resource layout and keep the scope
explicit:

- one site
- one structure
- explicit mappings
- optional cleanup phase

### 3. Validate before mutating

```bash
ldev liferay resource migration-pipeline --migration-file <file> --check-only
```

For large changes, also dry-run content migration updates:

```bash
ldev liferay resource migration-pipeline \
  --migration-file <file> \
  --check-only \
  --migration-dry-run
```

### 4. Run the introduce phase

```bash
ldev liferay resource migration-pipeline --migration-file <file>
```

### 5. Run cleanup only after validation

```bash
ldev liferay resource migration-pipeline --migration-file <file> --run-cleanup
```

## Validation checklist

- Structures and templates can still be discovered through `ldev liferay inventory ...`.
- The migration pipeline completes without unexpected errors.
- `ldev logs --since 5m --service liferay --no-follow` stays clean enough to explain the outcome.
- If search behavior depends on migrated fields, verify reindex state with:

```bash
ldev liferay reindex status --json
ldev liferay reindex tasks --json
```

## Guardrails

- Never treat a live content migration as a plain import.
- Always keep a descriptor file under version control.
- Always run `--check-only` before the real pipeline.
- Only run cleanup after functional validation of the introduced shape.
