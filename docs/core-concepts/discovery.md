---
title: Discovery
description: Inspect Liferay state directly from APIs and structured output instead of depending on the UI.
---

# Discovery

Discovery means understanding a Liferay system before you change it. With `ldev`, discovery does not depend on the UI.

## Portal discovery

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
ldev portal inventory structures --site /global --with-templates --json
ldev portal inventory templates --site /global --json
ldev portal inventory where-used --type structure --key BASIC --site /global --json
```

These commands tell you:

- what sites exist
- how pages are arranged
- what route maps to a specific page
- which structures and templates exist (and how they are paired)
- where a shared portal resource is actually used

For structure/template incidents, prefer `inventory structures --with-templates` as the first step: it returns both in one call, so you can route directly to the matching `resource export-*` or `resource import-*` command.

For impact analysis, prefer `inventory where-used` once you already know the
resource key. It is the fast answer to “before I change this Structure,
Template, fragment, widget, or ADT, which Pages will I touch?”

When possible, add `--site` so the scan stays scoped to one Site instead of all
accessible Sites.

## Preflight

API surface probing before longer flows:

```bash
ldev portal inventory preflight
ldev portal inventory preflight --force-refresh
```

Attach preflight as a pre-hook to any inventory or resource run with `--preflight`:

```bash
ldev portal inventory --preflight sites --json
ldev resource --preflight export-structures --all-sites
```

Preflight checks availability of `adminSite`, `adminUser`, and JSONWS API surfaces for the current credentials. The result is cached until refreshed.

## Runtime discovery

```bash
ldev ai bootstrap --intent=discover --json
ldev context --json
ldev status
ldev doctor --json
```

These commands tell you:

- which repo and runtime `ldev` resolved
- whether services are healthy
- whether the environment is ready for portal operations
- which command areas are ready right now

`ldev context` is the canonical offline snapshot. Agents should normally start
with `ldev ai bootstrap --intent=discover --json`, which wraps that snapshot in
the agent-facing shape.

## Why discovery comes first

Most maintenance mistakes happen because someone changed the system before they understood it.

Use discovery first so you know:

1. what environment you are targeting
2. what portal object you are looking at
3. whether the problem is portal, runtime, data, or OSGi related
