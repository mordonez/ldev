---
title: Discovery
description: Inspect Liferay state directly from APIs and structured output instead of depending on the UI.
---

# Discovery

Discovery means understanding a Liferay system before you change it.

With `ldev`, discovery does not depend on the UI.

## Portal discovery

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
```

These commands tell you:

- what sites exist
- how pages are arranged
- what route maps to a specific page

## Runtime discovery

```bash
ldev context --json
ldev status --json
ldev doctor --json
```

These commands tell you:

- which repo and runtime `ldev` resolved
- whether services are healthy
- whether the environment is ready for portal operations

## Why discovery comes first

Most maintenance mistakes happen because someone changed the system before they understood it.

Use discovery first so you know:

1. what environment you are targeting
2. what portal object you are looking at
3. whether the problem is portal, runtime, data, or OSGi related
