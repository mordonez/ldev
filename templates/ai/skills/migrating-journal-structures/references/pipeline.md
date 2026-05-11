# Journal Migration Pipeline Reference

Use this reference after `migrating-journal-structures/SKILL.md` has classified
a change as migration-required.

## Dependent Structures

If the migration targets fields inside a new structure that does not yet exist
in the portal, create it from source before `migration-init`:

```bash
ldev resource import-structure --site /<site> --structure <KEY> --check-only
ldev resource import-structure --liferay-timeout-seconds 300 --site /<site> --structure <KEY>
ldev resource structure --site /<site> --structure <KEY> --json
```

Use `../../developing-liferay/references/structure-field-catalog.md` for field
shapes.

## Descriptor Fields

| Field                             | Purpose                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `"templates": true`               | Include every associated template in the pipeline run; leave false for data-only migrations      |
| `"dependentStructures": ["KEY"]`  | Verify required structures exist before running                                                  |
| `"introduce.rootFolderIds": [id]` | Scope to a folder tree recursively                                                               |
| `"introduce.folderIds": [id]`     | Scope to exact folders only                                                                      |
| `"introduce.articleIds": [id]`    | Scope to specific content items                                                                  |
| no scope field                    | Scan all content in the site; never use for first worktree validation unless explicitly approved |

## Worktree Validation Scope

When validating a new migration plan in a worktree, set
`introduce.articleIds` to the exact content item used for Red/Green testing.
This keeps validation fast and avoids mutating unrelated local data while the
descriptor is still being proven.

Do not run an unscoped site-wide migration as the first validation pass. Use
unscoped or broad folder scopes only after the single-article path is Green and
the user accepts the broader runtime cost and mutation scope.

## Data-Only Template Scope

For migrations whose only purpose is to move saved Journal field values, keep
`"templates": false` and do not generate the descriptor with `--templates`.
That flag makes the pipeline validate all templates associated with the
structure, including cards or search snippets not touched by the issue. Use it
only when the migration also edits those templates and their hashes are
intentionally part of the proof.

## Repeatable Field Decisions

When converting an existing field or field pair into a repeatable shape, stop
before editing and ask which model is intended:

- migrate existing saved values into the first repeated entry and optionally
  clean up legacy fields
- keep legacy fields readable and add extra repeatable fields for new entries

The first option requires a descriptor-backed migration. The second option is an
additive compatibility design and must be documented in the plan.

## Non-Destructive First Proof

The first proof in a worktree must preserve every legacy field as a readable
source. Do not remove legacy fields from the structure, do not remove fallback
template reads, do not set `"cleanupSource": true`, and do not pass
`--run-cleanup`.

For legacy-to-repeatable migrations, first add the new repeatable fieldset while
keeping the old fields in the schema. It is acceptable to remove old fields from
the visible layout only when they remain present in the structure JSON and can
still be read by the migration.

New fieldset children must use new unique `fieldReference`/`name` values. Do
not reuse legacy identifiers inside the repeatable fieldset; duplicate field
identifiers make the schema ambiguous and can cause Liferay to blank or remap
legacy content during persistence.

After read-after-write proves that target fields contain copied values and the
final template renders them, ask for explicit user confirmation before the
cleanup phase. Only then may the plan remove legacy fields, remove fallback
template logic, set cleanup mappings, or run:

```bash
ldev resource migration-pipeline --migration-file <file> --run-cleanup
```

## Command Boundary

Use `migration-pipeline` for normal work. `import-structure --migration-plan`
accepts the same descriptor, but it is a lower-level debugging path; do not use
it to bypass the descriptor flow or the final read-back proof.

## Mapping Syntax

```json
{ "source": "oldField", "target": "newField" }
{ "source": "oldField", "target": "FieldsetName[].TargetField", "cleanupSource": false }
```

Use `FieldsetName[].TargetField` when the destination lives inside a repeatable
fieldset. Use `"cleanupSource": false` for the first proof. Add
`"cleanupSource": true` only after cleanup is explicitly approved.

For a new fieldset, use the semantic field reference from the structure JSON,
not an exported/generated suffix. If a candidate target looks like
`SomethingFieldSetFieldSet[].Child`, stop and inspect the structure: it usually
means the fieldset was named with a `FieldSet` suffix and Liferay added another
suffix on export.

## Validation Variants

Dry-run content updates for larger changes:

```bash
ldev resource migration-pipeline --migration-file <file> --check-only --migration-dry-run
```

The first real worktree proof should run without cleanup:

```bash
ldev resource migration-pipeline --migration-file <file>
```

Then read the migrated article/content from runtime and verify the target
fieldset contains the copied values. Only after that proof and explicit user
approval, run cleanup:

```bash
ldev resource migration-pipeline --migration-file <file> --run-cleanup
```

Run cleanup only when the descriptor, plan, and user explicitly approve it.

## Timeout Handling

Structure imports and content migrations can be slow enough to hit the default
Liferay HTTP timeout. Prefer increasing the timeout up front for migration
commands instead of treating repeated recoverable timeouts as normal:

```bash
ldev resource migration-pipeline --liferay-timeout-seconds 300 --migration-file <file> --check-only --migration-dry-run
ldev resource migration-pipeline --liferay-timeout-seconds 300 --migration-file <file>
ldev resource import-structure --liferay-timeout-seconds 300 --site /<site> --structure <KEY> --migration-plan <file>
ldev resource import-template --liferay-timeout-seconds 300 --site /<site> --template <KEY>
```

For repeated work, configure `LIFERAY_CLI_HTTP_TIMEOUT_SECONDS=300` or
`liferay.oauth2.timeoutSeconds`. A longer timeout only reduces ambiguous client
timeouts; it does not replace read-after-write verification.

If the real run fails after `--check-only` passed, do not hypothesize from the
browser state first. Inspect the precise server/API error with fresh logs and
the migration output, then validate the target path against the runtime
structure JSON.

If search depends on migrated fields, tell the user that forcing reindex is a
manual Liferay UI step. `ldev` must not be presented as a way to start or force
reindex. Use `ldev logs diagnose --since 10m --json` only to inspect symptoms
after the manual UI action.
