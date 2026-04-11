# Issue Workflow Contract

Short contract for issue work in `ldev` projects.

## Hard Gates

1. Resolve the issue URL to a local runtime URL before browser reproduction.
2. Reproduce the bug locally before creating code changes.
3. If the project uses isolated worktrees, reproduce again in the worktree
   runtime before the first edit or runtime mutation.
4. Inspect the loaded page and resolve the owning resource before broad grep.
5. Define `Green` as a checklist of observable symptoms, not as a successful
   command or a screenshot existing on disk.
6. If the symptom is still present, stay in `Red`.

## Minimum Issue Record

Before editing, record:

- issue number
- local URL used for `Red`
- page/layout/site resolved by `ldev`
- owning surface: ADT, template, fragment, theme, module, or `UNKNOWN`
- symptom checklist to verify in `Green`

## Invalid Shortcuts

- production screenshot counted as local reproduction
- grep first, inspect later
- import/deploy success counted as validation
- "I found a likely fix in another branch" counted as completion
- "before/after screenshots exist" counted as proof without checking symptoms

## Handoff Minimum

Every handoff must state:

- `Validated`
- `Not validated`
- `Unknowns`

If anything remains in `Not validated` or `Unknowns`, do not present the issue
as fully resolved.
