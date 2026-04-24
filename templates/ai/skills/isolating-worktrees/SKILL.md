---
name: isolating-worktrees
description: 'Use when an ldev-native task needs an isolated worktree with its own runtime, or when you must lock edits to a confirmed worktree root.'
---

# Isolating Worktrees

Use this skill for reusable `ldev worktree` setup, edit-root lock, recovery,
and cleanup.

This is the canonical vendor playbook for isolated worktrees. Project skills may
add naming or review conventions on top, but they should not duplicate the
technical flow.

## When to use

Use this skill when:

- an `ldev-native` task must not mutate the main checkout runtime
- a reproduction or migration needs its own DB, config, or mounted file state
- you need a confirmed edit boundary inside `.worktrees/<name>`
- worktree setup is blocked by `WORKTREE_MAIN_ENV_RUNNING`

Do not use this skill when:

- the repository is a `blade-workspace` with no `ldev-native` worktree flow
- the task can stay on the main checkout without runtime-state isolation

## Quick flow

1. Decide whether the task needs a runtime-backed worktree or a git-only worktree.
2. Choose a traceable worktree name and do not reuse existing worktrees unless the user explicitly asked for that reuse.
3. Check the current branch with `git branch --show-current`. If the primary checkout is not on `main`, stop and ask the user which base branch the worktree should use before running setup. Pass it as `--base <ref>` to `ldev worktree setup`.
4. For git-only worktrees, use `ldev worktree setup --name <worktree-name>`. For runtime-backed worktrees, always use `ldev worktree setup --name <worktree-name> --with-env --stop-main-for-clone --restart-main-after-clone`.
5. Immediately after setup, `cd .worktrees/<worktree-name>` and confirm the root with `git rev-parse --show-toplevel`. Do not run any further commands until the root is confirmed. If you cannot confirm that the current directory is inside `.worktrees/<worktree-name>`, stop and ask the user to confirm the working directory before continuing.
6. For runtime-backed worktrees, run `ldev start` **from inside the worktree directory**, then `ldev status --json`, and wait for startup logs before portal-facing actions. If `ldev start` would run from the main checkout, stop and ask the user which runtime to start instead of proceeding autonomously.
7. Keep the confirmed root as an active edit boundary for the whole task.
8. Clean up only after explicit human approval.

## Reference

Read `references/worktree-flow.md` for setup variants, recovery paths,
inspection, and cleanup details.