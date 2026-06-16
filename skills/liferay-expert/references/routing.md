# Routing Reference

Use this reference when `liferay-expert` has already determined that the task is
technical Liferay work and the next skill is still ambiguous.

## Canonical Choices

- Non-trivial issue, feature, or bug fix that will mutate code/resources/runtime -> `runtime-change-workflow`
- Cause is unclear or the local portal is unhealthy -> `troubleshooting-liferay`
- Affected implementation surface is known -> `developing-liferay`
- Structures, templates, ADTs, or fragments -> `portal-resource-workflow`
- Existing change needs build, deploy, import, or runtime verification -> `deploying-liferay`
- Journal structure field rename, type change, cross-structure move, or repeatability conversion where saved values must appear at a new field path -> `migrating-journal-structures`
- User-facing browser reproduction or visual evidence -> `automating-browser-tests`

## Scenario Checks

- Feature request from an issue: start with `runtime-change-workflow`; it will
  route implementation and verification.
- Runtime incident: start with `troubleshooting-liferay`; switch to
  implementation/deploy only after the root cause is known.
- Journal template or ADT edit: use `portal-resource-workflow`; do not use theme
  or module deploys.
- Structure reorganization (grouping fields into fieldsets, nesting, reordering) with
  unchanged field `name` values: use `portal-resource-workflow`; plain `import-structure`
  is enough — Liferay remaps `parentfieldid` automatically.
- Structure change that renames a field, changes its type, moves data to a different
  structure, or must preserve saved values at a new field path: use
  `migrating-journal-structures`; plain import is not enough.

## Useful Follow-Up References

- Troubleshooting: `../../troubleshooting-liferay/references/specialized-diagnosis.md`
- Implementation paths: `../../developing-liferay/references/implementation-paths.md`
- Structures: `../../developing-liferay/references/structures.md`
- Site objects: `site-objects.md`
- Worktree deploy pitfalls: `../../deploying-liferay/references/worktree-pitfalls.md`
