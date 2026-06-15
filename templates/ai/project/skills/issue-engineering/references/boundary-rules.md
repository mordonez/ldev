# Boundary Rules

Use this reference only when you need to decide whether `issue-engineering`
owns a step or whether the work belongs in a vendor skill.

## What stays in issue-engineering

- issue intake and scope notes
- issue naming conventions for branches or worktrees
- temporary issue artifacts under `.tmp/issue-<num>/`
- project-specific reviewer, evidence, and closure expectations
- human handoff and cleanup rules that are unique to this repository

## What must move to vendor skills

Do not expand this project skill into the canonical source for:

- page or resource discovery with `ldev portal inventory ...`
- runtime diagnosis with `ldev doctor`, `ldev context`, `ldev status`, or `ldev logs ...`
- export or import command selection
- deploy strategy
- generic worktree troubleshooting
- migration pipeline execution
- reusable browser automation patterns

If the knowledge is reusable across `ldev` projects, move it out of this skill.

## Invalid reasons to skip the worktree gate

For `ldev-native`, these are not valid reasons to skip isolated worktree setup:

- the task is small
- the current branch is already a feature branch
- the runtime is already running
- the user did not explicitly ask for a worktree
- the task did not start from a formal GitHub issue

If you are reasoning toward one of these, stop and return to the main gate
order in `SKILL.md`.

## When to stop instead of improvising

Stop and report a blocker when:

- the bug does not reproduce locally
- the runtime required for reproduction or validation is unavailable
- the task needs generic `ldev` technical guidance not defined here
- the repository process conflicts with the vendor skill contract