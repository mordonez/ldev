---

description: Resource sync and Journal migration guidance using `ldev`
globs: liferay/resources/**,configs/**,modules/**
alwaysApply: false

---

# `ldev` Resource and Migration Workflows

Use `ldev resource` for repository-backed content workflows that are not covered cleanly by generic portal tools.

Typical entry points:

- `ldev resource export-structures --site /my-site --json`
- `ldev resource export-templates --site /my-site --json`
- `ldev resource migration-pipeline --site /my-site`

When changing Journal structures with existing content:

- prefer a planned migration workflow
- avoid one-off manual edits without export and review
- validate the affected content and follow-up imports explicitly

These flows are a core reason to prefer `ldev` over raw low-level API calls.
