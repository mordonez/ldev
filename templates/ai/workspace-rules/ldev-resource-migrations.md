---

description: Resource sync and Journal migration guidance using `ldev`
globs: **/resources/**,configs/**,modules/**
alwaysApply: false

---

# `ldev` Resource and Migration Workflows

Use `ldev resource` for repository-backed content workflows that are not
covered cleanly by generic portal tools.

Typical entry points:

- `ldev resource export-structure --site /my-site --key <key> --json`
- `ldev resource export-template --site /my-site --id <id> --json`
- `ldev resource export-adt --site /my-site --key <key> --widget-type <type> --json`
- `ldev resource export-fragment --site /my-site --fragment <key> --json`
- `ldev resource import-structure --site /my-site --key <key> --check-only`
- `ldev resource import-template --site /my-site --id <id> --check-only`
- `ldev resource import-adt --site /my-site --file <file> --check-only`
- `ldev resource migration-pipeline --migration-file <file>`

Prefer atomic commands. If several resources changed, repeat the singular
command per resource so failures and diffs stay attributable. Do not use plural
resource commands unless a human explicitly asks for a bulk operation and the
risk is written down first.

Resource changes are runtime changes. Do not use `ldev deploy theme`,
`ldev deploy module`, or a broad deploy to apply Journal templates, ADTs,
fragments, or structures.

When changing Journal structures with existing content:

- prefer a planned migration workflow
- avoid one-off manual edits without export and review
- validate the affected content and follow-up imports explicitly
- verify browser-visible behavior with `playwright-cli` after the runtime import

If the post-import page still shows any reported symptom, the issue is not
green yet. Continue diagnosis; do not handoff as resolved just because the
import command succeeded.

For the full workflow, route to vendor skills:

- `developing-liferay`
- `migrating-journal-structures`

This rule is only a short reminder. The full reusable playbooks belong in the
vendor skills above.
