---
name: ldev-shared
description: 'Base reference for all ldev skills. Use when starting any ldev session or loading any other ldev skill. Covers bootstrap interpretation, universal flags, safety invariants, and command disambiguation.'
---

# ldev — Shared Reference

> **All other ldev skills require this one.** Read it first.

## Bootstrap

Every session starts with bootstrap. It tells the agent what the project looks like, which commands are available, and whether the portal is reachable.

```bash
ldev ai bootstrap --json
# or with intent hint:
ldev ai bootstrap --intent=deploy --json
ldev ai bootstrap --intent=troubleshoot --json
ldev ai bootstrap --intent=resource --json
```

Key fields to inspect:

| Field | What it tells you |
|---|---|
| `context.projectType` | `ldev-native`, `blade-workspace`, or `unknown` |
| `context.liferay.portalUrl` | The portal URL the commands will target |
| `context.liferay.auth.oauth2.*.status` | Whether OAuth is configured and reachable |
| `context.commands.*` | Which ldev commands are available in this project |
| `context.paths.resources.*` | Where local resource files live |
| `doctor.readiness.*` | Whether the environment is ready for deploy / portal / resource operations |
| `doctor.checks[]` | Active health check results |

If required fields are missing or `doctor.readiness` shows failures, resolve those before proceeding. Do not attempt portal or resource operations against an unhealthy env.

## Universal Flags

| Flag | When to use |
|---|---|
| `--json` | Always. Use on every verification and diagnostic command. |
| `--ndjson` | For streaming commands or when processing line by line. |
| `--strict` | Automation pipelines that need `{ "ok": true, "data": ... }` envelope. |
| `--check-only` | Before any resource mutation. Validates without writing. |

Never parse human-readable output when `--json` is available.

## Command Disambiguation

These three commands are not interchangeable:

| Command | When to use |
|---|---|
| `ldev status --json` | Docker / runtime process state (is the container running?) |
| `ldev context --json` | Offline repo facts (project type, paths, config) — no network calls |
| `ldev doctor --json` | Active health checks against a running portal and env |

Use `ldev status` to check if the env is up. Use `ldev doctor` to check if it is healthy. Use `ldev context` when you only need repo metadata and the portal may be down.

## Safety Invariants

Follow these on every session:

1. **Discover before mutate.** Run bootstrap + status/doctor before any write operation.
2. **`--check-only` before mutation.** Always run resource import with `--check-only` first.
3. **Read-after-write verify.** After any mutation, read back the changed resource — log success alone is not sufficient proof.
4. **Prefer focused over broad.** Use the narrowest deploy or import that covers the change.
5. **Stop on unhealthy env.** If `ldev doctor` reports failures, diagnose before continuing. Switch to `troubleshooting-liferay`.
6. **Do not parse human text when JSON exists.** Use `--json` and address structured fields.
