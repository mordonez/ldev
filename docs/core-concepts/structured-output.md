---
title: Structured Output
description: Use JSON output from ldev to script diagnostics, capture context, and support automation safely.
---

# Structured Output

Many `ldev` commands support `--json` or `--ndjson`.

That matters because maintenance work is easier when the output is consistent and machine-readable.

## Commands you will use most

```bash
ldev doctor --json
ldev context --json
ldev status --json
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

## Example

```bash
ldev portal inventory page --url /home --json > page-home.json
ldev logs diagnose --since 10m --json > diagnosis.json
```

The point is not automation for its own sake. The point is reliable inputs for diagnosis and verification.
