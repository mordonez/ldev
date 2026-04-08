---
title: Runtime Commands
description: Minimal reference for starting, checking, and repairing local Liferay environments.
---

# Runtime Commands

## `ldev doctor`

Validate prerequisites and effective config.

```bash
ldev doctor
ldev doctor --json
```

## `ldev setup`

Prepare images, env files, and local runtime wiring.

```bash
ldev setup
```

## `ldev start`

Start containers and wait for Liferay readiness.

```bash
ldev start
ldev start --activation-key-file /path/to/key.xml
```

## `ldev stop`

Stop the environment.

```bash
ldev stop
```

## `ldev status`

Show current environment state.

```bash
ldev status
ldev status --json
```

## `ldev logs diagnose`

Group recent log errors by type and frequency.

```bash
ldev logs diagnose --since 10m --json
```

## `ldev env restart`

Restart the runtime service when deployment or config state needs a clean refresh.

```bash
ldev env restart
```
