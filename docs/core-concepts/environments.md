---
title: Environments
description: How ldev treats local Liferay environments as reproducible operational systems.
---

# Environments

`ldev` assumes that a Liferay environment should be reproducible, inspectable, and replaceable.

## Reproducibility

The point is not just to start a portal. The point is to rebuild the same operational state when you need to diagnose a failure.

Common flow:

```bash
ldev setup
ldev start
ldev db sync --environment production --project my-lcp-project --force
```

That lets you move from a clean local environment to a production-like one without inventing manual steps.

## Docker as the runtime boundary

`ldev` uses Docker-based local environments so startup, restart, reset, and state transfer are explicit commands instead of tribal knowledge.

Core commands:

```bash
ldev start
ldev stop
ldev env restart
ldev env recreate
```

## Worktrees for isolated debugging

When one branch is reproducing a production incident and another is active development, use isolated worktrees:

```bash
ldev worktree setup --name incident-123 --with-env
cd .worktrees/incident-123
ldev start
```

This keeps branch state and runtime state aligned.

## Safety

A reproducible environment is a safety feature.

It lets you:

- debug locally before production changes
- compare before and after behavior
- verify a fix with the same commands every time
