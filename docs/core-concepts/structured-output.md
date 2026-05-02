---
title: Structured Output
description: Why every ldev command returns structured JSON, and how that connects humans, scripts and AI agents to the same workflows.
---

# Structured Output

Every `ldev` command that returns data supports a structured output mode.

That is not just a developer-experience detail. It is the reason the same
workflow is usable by:

- a developer typing in the terminal
- a script running in CI
- an AI agent over MCP

The output is identical. You build automation against it the same way you
read it.

## Output formats

- `--format text` (default for most) — human-readable output
- `--json` / `--format json` — pretty-printed JSON, one object per command
  run
- `--ndjson` / `--format ndjson` — newline-delimited JSON; most commands
  still emit one final JSON value, while streaming-style commands may emit
  multiple lines
- `--strict` — return a non-zero exit code when the result indicates
  something is wrong (even if the command itself succeeded)

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

Structured output is what makes everything else in `ldev` composable:

- repeatable diagnostics — the same JSON every time, so a previous run
  diff-able against a current one
- incident notes and snapshots — JSON pasted directly into a ticket or a
  postmortem
- agent workflows — the MCP server returns the same JSON as the CLI, so an
  agent does not have to parse human-readable output
- CI checks and scripts — `--strict` plus `jq` is enough to fail a pipeline
  on a regression

## Exit codes and error shapes

`ldev` normalises errors into a stable envelope:

```json
{
  "code": "OAUTH_INSTALL_OPTION_INVALID",
  "exitCode": 2,
  "message": "--user-id requires --company-id."
}
```

Error codes come from per-feature factories (`EnvErrors`, `WorktreeErrors`,
`DeployErrors`, `DbErrors`, `OAuthErrors`, `LiferayErrors`). The `code` field
is stable and meant for scripts; the `message` is safe to display (secrets
are sanitised).

Common exit codes:

- `0` — success
- `1` — generic failure (or result-derived, for example `env is-healthy` on
  unhealthy state, `page-layout diff` when pages differ)
- `2` — invalid CLI option or contract error

## Capture once, reuse everywhere

```bash
ldev portal inventory page --url /home --json > page-home.json
ldev logs diagnose --since 10m --json > diagnosis.json
ldev ai bootstrap --intent=develop --json > bootstrap.json
```

The point is not automation for its own sake. It is reliable inputs that the
same humans, scripts and agents can keep using over time.
