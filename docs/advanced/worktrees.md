---
title: Worktrees
description: Use isolated git worktrees when you need separate branches and separate local runtime state.
---

# Worktrees

Use worktrees when one branch is reproducing an incident and another is active development.

## Create an isolated environment

```bash
ldev worktree setup --name incident-123 --with-env
cd .worktrees/incident-123
ldev start
```

## Why use it

- keep production-repro work separate from feature work
- compare fixes across branches
- avoid mixing runtime state between unrelated tasks

## Clean up

```bash
ldev worktree clean incident-123 --force
```

Use this workflow only when isolation matters. Most day-to-day work does not need it.
