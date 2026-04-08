---
title: Operations Model
description: The default ldev operating model for Liferay troubleshooting and maintenance.
---

# Operations Model

`ldev` is built around one operating loop:

`understand -> diagnose -> fix -> verify`

## Understand

Collect context first.

```bash
ldev context --json
ldev doctor --json
ldev portal inventory page --url /home --json
```

## Diagnose

Use the shortest path to a useful signal.

```bash
ldev logs diagnose --json
ldev osgi diag com.acme.foo.web
```

## Fix

Apply the smallest change that addresses the confirmed issue.

```bash
ldev deploy module foo-web
ldev env restart
```

## Verify

Use the same commands you used to diagnose.

```bash
ldev portal check
ldev logs diagnose --since 5m --json
```

## Why this matters

This model keeps maintenance work practical:

- production issues become local workflows
- fixes happen in a controlled environment
- verification is explicit, not assumed
