---
name: managing-worktree-env
description: "Compatibility wrapper. Use when you need isolated worktree runtime setup, inspection or cleanup. Delegate to /issue-engineering for the full lifecycle."
---

# managing-worktree-env

Compatibility wrapper around the worktree/runtime flow.

Use the namespaced `ldev worktree ...` commands:

- create or reuse: `ldev worktree setup --name issue-123 --with-env`
- inspect env wiring: `ldev worktree env --json`
- remove safely: `ldev worktree clean issue-123 --force`

For the full issue lifecycle, delegate to `/issue-engineering`.
