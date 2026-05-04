# Worktree Env

This file is a project overlay on top of the vendor skill `isolating-worktrees`.

Read that vendor skill first for setup, root locking, recovery, and cleanup.
Use this file only for project-specific issue conventions.

## Project conventions

- Derive the worktree name from the issue identifier provided in this session.
- If the user did not provide an issue identifier, derive a short descriptive
  name from the task. Do not invent a numeric identifier.
- If the current session is already inside a worktree, ask whether this issue
  should continue there before creating another worktree.
- Do not switch from the active worktree to a different visible worktree unless
  the user explicitly asked for that switch.
- After `ldev start`, reproduce the bug again in the worktree runtime before the
  first code change or resource import.

## Issue-first inspection

For issue work that starts from a URL, the vendor skill's quick inspection must
be followed by:

```bash
ldev portal inventory page --url <localUrl> --json
```

Do not start repo-wide grep or code edits until the worktree runtime has loaded
the target page and you have identified the concrete page or resource to change.

## Cleanup reminder

Keep cleanup tied to the actual issue worktree and only after explicit human
approval.
