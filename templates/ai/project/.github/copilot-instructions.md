# Copilot Instructions

This project uses `ldev` to manage a Liferay portal environment.

Read these files for full context before making changes:

- **`AGENTS.md`** — bootstrap procedure, operating rules, and installed skills.
- **`CLAUDE.md`** — project-specific context: stack, layout, and conventions (if present).

## Bootstrap

Before changing code or runtime state:

1. Run `ldev doctor`.
2. Run `ldev status --json`.
3. Read the task-specific skill under `.agents/skills/` if one applies.

## Operating Rules

- Use `ldev` as the official entrypoint.
- For machine-readable output use `ldev doctor --json`, `ldev status --json`.
- If the task will change tracked files, use an isolated worktree:

```bash
ldev worktree setup --name <name> --with-env
cd .worktrees/<name>
git rev-parse --show-toplevel
git status --short
ldev start
```

Creating the worktree is not enough. Before editing any file, confirm the file
path is under the `.worktrees/<name>` root returned by
`git rev-parse --show-toplevel`. Do not write issue changes into the primary
checkout.
