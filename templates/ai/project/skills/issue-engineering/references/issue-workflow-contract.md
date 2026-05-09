# Issue Workflow Contract

Short contract for issue work in `ldev` projects.

## Hard Gates

1. Resolve issue URLs with `ldev portal inventory` for context, but do not use
   the primary checkout as the Red environment for `ldev-native` work.
2. If the project uses isolated worktrees, create or enter the worktree first.
3. Reproduce the bug once in the worktree runtime before the first edit or
   runtime mutation.
4. Before the first edit, prove the current editing root is the isolated
   worktree with `git rev-parse --show-toplevel`; edited paths must be under
   that root, never the primary checkout.
5. Keep the editing root proof current. If the session is interrupted, resumed,
   moved to another terminal, or any command may have changed directories, prove
   the root again before the next edit.
6. Inspect the loaded page and resolve the owning resource before broad grep.
7. Define `Green` as a checklist of observable symptoms, not as a successful
   command or a screenshot existing on disk.
8. If the symptom is still present, stay in `Red`.

## Minimum Issue Record

Before editing, record:

- issue number
- worktree local URL used for `Red`
- page/layout/site resolved by `ldev`
- owning surface: ADT, template, fragment, theme, module, or `UNKNOWN`
- editing root from `git rev-parse --show-toplevel`
- symptom checklist to verify in `Green`

## Invalid Shortcuts

- production screenshot counted as worktree reproduction
- grep first, inspect later
- worktree created but edits still written under the primary checkout
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
