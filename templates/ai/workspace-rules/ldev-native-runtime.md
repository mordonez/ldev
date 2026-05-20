---

description: Runtime and layout guidance for ldev-native repositories
globs: *
alwaysApply: true

---

# ldev-native Runtime

Use this rule only when the project type is `ldev-native`.

Key layout:

- `docker/` holds the Compose-owned runtime model
- `liferay/` holds source, resources, and build outputs for the local runtime
- `docker/.env` defines the main runtime variables for ports, services, and data roots

This project type is intentionally more opinionated:

- `ldev` owns more of the runtime contract directly
- Compose customization, auxiliary services, and layout-dependent flows are expected
- worktrees, snapshots, and some recovery/data workflows are part of the native story

Operational entry points:

- `ldev start`
- `ldev status --json`
- `ldev logs diagnose --json`
- `ldev db ...`
- `ldev env ...`
- `ldev worktree ...`

`ldev setup` is optional. Use it before `ldev start` only when you want to
pre-pull Docker images or warm local runtime directories.

Prefer these commands over raw Docker commands when you need repeatable local behavior.
