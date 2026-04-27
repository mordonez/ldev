---
name: issue-engineering
description: "Use when a project-owned GitHub issue must be handled end-to-end: intake, isolated worktree, reproduction, fix, validation, PR and cleanup."
---

# Issue Engineering

> This skill has been promoted to the standard `ldev` vendor surface.
> The canonical version is installed at `.agents/skills/issue-engineering/SKILL.md`
> when you run `ldev ai install`.
>
> If you are reading this copy from `legacy/`, use the installed version instead.
> The content below is kept here only as a reference while the project transitions.

Use this skill for the full issue lifecycle.

## Hard rules

- Use an isolated worktree:

```bash
ldev worktree setup --name issue-NUM --with-env
cd .worktrees/issue-NUM
ldev start
```

- Resolve portal context before broad code search:

```bash
ldev liferay inventory page --url <url> --json
ldev liferay resource resolve-adt --display-style ddmTemplate_<ID> --site /<site> --json
```

- Verify changes with `ldev deploy ...`, `ldev osgi ...`, `ldev logs ...` and the real URL.
- Clean the worktree only after the PR exists:

```bash
ldev stop
cd ../..
ldev worktree clean issue-NUM --force
```

## Minimal lifecycle

1. Intake issue with `gh issue view`.
2. Create an isolated worktree with `ldev worktree setup`.
3. Discover runtime state with `ldev context --json`, `ldev status --json` and `ldev liferay inventory ...`.
4. Apply the smallest fix through the appropriate specialist skill.
5. Verify runtime.
6. Open PR and comment back on the issue.
