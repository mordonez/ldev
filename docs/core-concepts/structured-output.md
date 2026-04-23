---
title: Structured Output
description: Use JSON output from ldev to script diagnostics, capture context, and support automation safely.
---

# Structured Output

Every `ldev` command that returns data supports a structured output mode.

## Output formats

- `--format text` (default for most) — human-readable output
- `--json` / `--format json` — pretty-printed JSON, one object per command run
- `--ndjson` / `--format ndjson` — one JSON value per line, suitable for streaming commands
- `--strict` — return a non-zero exit code when the result indicates something is wrong (even if the command itself succeeded)

Some commands default to JSON because their output is primarily structured:

- `ldev status`
- `ldev deploy status`
- `ldev env diff`
- `ldev portal audit`
- `ldev portal config get|set`
- `ldev portal page-layout export|diff`
- `ldev portal search mappings|query`
- `ldev portal theme-check`
- `ldev resource import-structures|import-templates|import-adts`
- `ldev resource export-structure|export-template`
- `ldev health`
- `ldev perf baseline|check`
- `ldev snapshot` / `ldev restore`
- `ldev ai status`

## Commands you will use most

```bash
ldev ai bootstrap --intent=develop --json
ldev context --json
ldev doctor --json
ldev status
ldev portal check --json
ldev portal inventory sites --json
ldev portal inventory page --url /home --json
ldev logs diagnose --json
```

## Why it matters

Structured output helps with:

- repeatable diagnostics
- incident notes and snapshots
- agent workflows
- CI checks and local scripts

## Exit codes and error shapes

`ldev` normalizes errors into a stable envelope:

```json
{
  "code": "OAUTH_INSTALL_OPTION_INVALID",
  "exitCode": 2,
  "message": "--user-id requires --company-id."
}
```

Error codes come from per-feature factories (`EnvErrors`, `WorktreeErrors`, `DeployErrors`, `DbErrors`, `OAuthErrors`, `LiferayErrors`). The `code` field is stable and meant for scripts; the `message` is safe to display (secrets are sanitized).

Common exit codes:

- `0` — success
- `1` — generic failure (or result-derived, e.g. `env is-healthy` on unhealthy, `page-layout diff` on differences)
- `2` — invalid CLI option or contract error

## Example

```bash
ldev portal inventory page --url /home --json > page-home.json
ldev logs diagnose --since 10m --json > diagnosis.json
ldev ai bootstrap --intent=develop --json > bootstrap.json
```

The point is not automation for its own sake. The point is reliable inputs for diagnosis and verification.
