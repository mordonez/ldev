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

Top-level lifecycle:

```bash
ldev setup
ldev start
ldev stop
ldev status
```

Advanced recovery lives under `ldev env`:

```bash
ldev env restart
ldev env recreate
ldev env restore
ldev env clean --force
```

Scriptable diagnostics:

```bash
ldev env wait --timeout 600 --poll 10
ldev env is-healthy
ldev env diff --write-baseline
ldev env diff
```

`is-healthy` returns `0` when healthy and `1` otherwise. `diff` compares the current environment against a saved baseline.

## Logs and shell

```bash
ldev logs --service liferay --since 10m
ldev logs diagnose --since 10m --json
ldev shell
```

`logs` streams container output directly. `logs diagnose` analyzes recent logs and groups exceptions by type and frequency.

## Worktrees for isolated debugging

When one branch is reproducing a production incident and another is active development, use isolated worktrees:

```bash
ldev worktree setup --name incident-123 --with-env
cd .worktrees/incident-123
ldev start
```

Worktrees inherit the files that exist in the branch or commit used as their base. Make sure runtime Compose overrides (e.g. `docker-compose.liferay.volume.yml`) are committed to that branch before creating the worktree.

On Linux + BTRFS, `ldev` uses subvolume snapshots to accelerate worktree env creation; refresh the base with `ldev worktree btrfs-refresh-base` when the main env changes.

## Safety

A reproducible environment is a safety feature.

It lets you:

- debug locally before production changes
- compare before and after behavior with `env diff`
- verify a fix with the same commands every time
