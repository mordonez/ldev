---
title: Environments
description: How ldev manages local Liferay environments — Docker as the runtime boundary, worktrees for isolation, and reproducibility for safe debugging.
---

# Environments

`ldev` treats a local Liferay environment as something that should be
reproducible, inspectable and replaceable.

This is one of the areas where `ldev` does real work, not just convenience.
`project init` + `setup` + `start` will scaffold a working Docker-based
Liferay from zero, and `worktree setup --with-env` will give a branch its
own runtime state.

## Bootstrap from zero

```bash
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev setup
ldev start --activation-key-file /path/to/activation-key.xml
ldev oauth install --write-env
```

Or, if you already have a repo that uses the `ldev` runtime layout:

```bash
ldev env init
ldev setup
ldev start
```

## Bring production-like state into local

If your portal lives in **Liferay Cloud (LCP)**:

```bash
ldev db sync --environment production --project my-lcp-project --force
ldev start
```

If your portal is **self-hosted**, `db sync` does not apply. Use a backup you
already have:

```bash
ldev db import --file /path/to/backup.sql.gz --force
ldev start
```

For Document Library content, see [Data Transfer](/advanced/data-transfer).

## Docker as the runtime boundary

`ldev` uses Docker so startup, restart, reset and state transfer are
explicit commands instead of tribal knowledge.

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

`is-healthy` returns `0` when healthy and `1` otherwise. `diff` compares the
current environment against a saved baseline.

## Logs and shell

```bash
ldev logs --service liferay --since 10m
ldev logs diagnose --since 10m --json
ldev shell
```

`logs` streams container output directly. `logs diagnose` reads recent logs,
groups exceptions by class with regex, and applies a small set of keyword
rules to suggest possible causes. Useful for triage; not deep diagnosis.

## Worktrees for isolated debugging

When one branch is reproducing an incident and another is active development,
use isolated worktrees:

```bash
ldev worktree setup --name incident-123 --with-env
cd .worktrees/incident-123
ldev start
```

If the git worktree already exists elsewhere:

```bash
cd /path/to/external/worktree
ldev worktree setup --with-env
ldev start
```

Each worktree gets its own Postgres, Liferay and OSGi state. On Linux + Btrfs,
`ldev` uses subvolume snapshots to make worktree creation near-instant; refresh
the base with `ldev worktree btrfs-refresh-base` when the main env changes.

Worktrees inherit the files that exist in the branch or commit used as their
base. Make sure runtime Compose overrides (for example,
`docker-compose.liferay.volume.yml`) are committed to that branch before
creating the worktree.

See [Worktrees](/advanced/worktrees) for the full model.

## Why this matters

A reproducible environment is a safety feature. It lets you:

- debug locally before any production change
- compare before-and-after behavior with `env diff`
- verify a fix with the same commands every time
- give an AI agent an environment it can stand up and reset on its own

Reproducibility and branch isolation are classic developer-experience moves;
the agent benefit is a consequence. See
[Why ldev Exists](/core-concepts/why-ldev-exists) for the full argument.
