---
name: migrating-journal-structures
description: 'Use when a Journal structure or template change requires controlled data migration, staged validation or cleanup.'
---

# Migrating Journal Structures

Use this skill when a structure change can affect existing content and must be
validated as a migration, not as a simple import.

## Before exploring

Read `../liferay-expert/references/domain-awareness.md` and apply the project
glossary in `docs/ai/project-context.md` to structure keys, template ids,
descriptor file names, and migration notes. Surface conflicts before authoring
the descriptor.

## Required bootstrap

```bash
ldev ai bootstrap --intent=migrate-resources --json
```

Use `bootstrap.context.paths.resources.migrations` and
`bootstrap.context.paths.resources.structures` for descriptor and structure
locations. Use `doctor.readiness.reindex` and portal checks to decide whether
the runtime is ready for migration validation.

## Bootstrap fields

- Required fields: `context.paths.resources.migrations`,
  `context.paths.resources.structures`, `context.liferay.auth.oauth2.*.status`,
  `doctor.readiness.reindex`.
- If any of those fields is missing, stop and report that the installed `ldev`
  AI assets are out of sync with the CLI.

> **Always run migrations inside a worktree, never against the main environment.**
> Use `../isolating-worktrees/SKILL.md` first to create the isolated worktree,
> confirm the edit root, and recover safely from setup blockers before running a
> migration.

## Recommended workflow

### 0. Create dependent structures first (if needed)

If the migration targets fields that will live inside a **new** structure that
does not yet exist in the portal (for example, a new repeatable fieldset
structure), create it from source before running `migration-init`.

Do **not** use the Liferay UI for this. Edit the structure JSON directly and
import it:

```bash
# 1. Write or edit the structure JSON under context.paths.resources.structures.path/<site>/<KEY>.json
#    Use ../developing-liferay/references/structure-field-catalog.md for the correct field shapes.

# 2. Validate before importing:
ldev resource import-structure --site /<site> --structure <KEY> --check-only

# 3. Import to the portal:
ldev resource import-structure --site /<site> --structure <KEY>

# 4. Confirm the structure exists:
ldev resource structure --site /<site> --structure <KEY> --json
```

Reference: `../developing-liferay/references/structure-field-catalog.md`

### 1. Inspect current portal state

```bash
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
ldev resource structure --site /<site> --structure <STRUCTURE_KEY> --json
ldev resource template --site /<site> --template <TEMPLATE_ID> --json
```

### 2. Scaffold a migration descriptor

Use `migration-init` to generate a base descriptor from the current portal state
before editing it by hand:

```bash
ldev resource migration-init --site /<site> --structure <STRUCTURE_KEY>
```

Add `--templates` to include associated templates in the generated descriptor.
The output defaults to `context.paths.resources.migrations.path/<site>/<key>.migration.json`.

Edit the descriptor to define:

- Explicit field mappings (`introduce.mappings`)
- Scope (see below)
- Dependent structures (`dependentStructures`) if the migration targets fields
  in structures that were just created
- Whether templates are included (`templates: true`)
- An optional cleanup phase

**Descriptor fields reference:**

| Field                             | Purpose                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| `"templates": true`               | Include associated templates in the pipeline run               |
| `"dependentStructures": ["KEY"]`  | Structures the pipeline must verify exist before running       |
| `"introduce.rootFolderIds": [id]` | Scope to a folder tree (recursive)                             |
| `"introduce.folderIds": [id]`     | Scope to exact folders only (non-recursive)                    |
| `"introduce.articleIds": [id]`    | Scope to specific content items                                |
| _(no scope field)_                | Scan all content in the site (use with caution on large sites) |

**Mapping syntax:**

```json
{ "source": "oldField", "target": "newField" }
{ "source": "oldField", "target": "FieldsetName[].TargetField", "cleanupSource": true }
```

Use `FieldsetName[].TargetField` when the destination lives inside a repeatable
fieldset in the new structure. Add `"cleanupSource": true` to remove the source
field from the original structure after migration.

When the migration introduces new fields or changes field types, use the field
type catalog to verify JSON shapes:

Reference: `../developing-liferay/references/structure-field-catalog.md`

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

### 4. Run the real pipeline deliberately

```bash
ldev resource migration-pipeline --migration-file <file>
```

If the descriptor includes cleanup and you intend to execute that cleanup in the
same real run, enable it explicitly:

```bash
ldev resource migration-pipeline --migration-file <file> --run-cleanup
```

Do not treat this as a default "run it once and then run it again" sequence.
Use one real execution plan deliberately after validation, with or without
`--run-cleanup`, based on the migration you are approving.

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

- **Never run migrations against the main environment.** Always use the vendor
  skill `isolating-worktrees` first so the portal state can be restored or
  discarded if the migration fails or produces unexpected results.
- Never treat a live content migration as a plain import.
- Always keep a descriptor file under version control.
- Always use `migration-init` to scaffold the descriptor; do not write it from scratch.
- Always run `--check-only` before the real pipeline.
- Do not document or automate migration-pipeline as a mandatory two-run sequence.
- If cleanup is intended, make that choice explicit in the approved real execution plan.
- If the migration targets fields in a new dependent structure, create and import
  that structure from JSON first (step 0) — do not use the Liferay UI.
- Use `../developing-liferay/references/structure-field-catalog.md` when authoring or editing structure
  JSON directly; do not guess field shapes.
