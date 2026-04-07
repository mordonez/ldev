---
title: Support Matrix
---

# Support Matrix

`ldev` is intentionally explicit about what is supported and what is not. The goal is a smaller support statement that users can trust.

## Project types

- `blade-workspace` — standard Liferay Workspace created with Blade. `ldev` integrates on top. Good for existing Workspace setups.
- `ldev-native` — `ldev` manages the full local runtime model with Docker Compose. Unlocks isolated worktrees, snapshot-based workflows, and advanced runtime capabilities.

For the full potential of `ldev`, use `ldev-native` with Docker Compose. For teams with existing Workspace structure, use `blade-workspace` with `ldev` integration.

## Product baseline

Current default Docker image baseline:

```text
liferay/dxp:2026.q1.0-lts
```

## Current status

| Platform         | Docker provider                   | Status        | Notes                                                                                        |
| ---------------- | --------------------------------- | ------------- | -------------------------------------------------------------------------------------------- |
| Linux            | Docker Engine + Compose v2 plugin | Supported     | Primary supported platform and the one covered by CI                                         |
| macOS            | Docker Desktop                    | Supported     | Core local environment workflows are supported                                               |
| macOS            | OrbStack                          | Experimental  | Expected to work for core workflows, but not part of CI and not yet a fully supported target |
| Windows (native) | Docker Desktop                    | Not supported | Not a supported target                                                                       |
| Windows via WSL2 | Docker Desktop / Docker Engine    | Experimental  | Not covered by CI; use only if you are comfortable debugging host-specific issues            |

## System requirements

- Node.js `20+`
- Git available in `PATH`
- Docker available in `PATH`
- `docker compose` available in `PATH`
- At least 8 GB RAM available to Docker for Liferay + Elasticsearch
- SSD-backed storage strongly recommended

## What “supported” means here

- The CLI is expected to work for normal local environment workflows on the relevant project type.
- The strongest public contract today is the Workspace-first surface plus the agent-core commands such as `doctor`, `context`, `portal check`, `portal inventory`, `status`, `logs`, and `mcp check`.
- The project documentation will describe that platform as a supported target.
- Regressions on that platform are considered release blockers.

## What “experimental” means here

- The workflow may work in practice.
- It is not part of the supported support statement.
- It is not currently covered by CI.
- Platform-specific issues may be fixed, but they are not release blockers.

## Linux-only features

These capabilities require Linux and are not part of the macOS or Windows story:

- Btrfs snapshot-based worktree cloning
- `ldev worktree btrfs-refresh-base`
- Btrfs-backed restore flows that depend on `BTRFS_BASE` / `BTRFS_ENVS`

On non-Linux hosts, normal `worktree` flows still exist, but the Btrfs optimization path does not.

That means:

- `worktree` remains part of the product
- the Btrfs acceleration path is a Linux-only advanced feature, not part of the cross-platform contract

## Known constraints

### macOS

- Docker bind-mount performance and file watching can be slower than Linux.
- Some file-event-driven flows may feel less responsive than on Linux.
- Btrfs features are not available.

### Windows

- Native Windows is not a supported target.
- If you use `ldev` through WSL2, treat it as experimental and keep the project inside the Linux filesystem, not the Windows-mounted filesystem.

### Heavy Liferay/DXP local stacks

- Liferay + Elasticsearch is materially heavier than a simple PHP or Node local stack.
- Expect slower cold starts, larger Docker resource usage, and more pressure on disk and memory.
- If Docker memory is too low, `ldev doctor`, `ldev start`, and Elasticsearch-related flows will often degrade first.

## CI coverage

Current CI coverage is intentionally narrower than the user base:

- CI runs on `ubuntu-latest`
- Node versions tested in CI: `20` and `22`
- Packaging validation is currently done on Linux

That means Linux is the most strongly evidenced platform today. macOS is supported by project intent and manual validation, but not yet backed by dedicated CI runners.

See also: [Install](/install) · [Troubleshooting](/troubleshooting) · [Upgrading](/upgrading)
