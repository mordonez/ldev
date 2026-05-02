---
title: Discovery
description: Use ldev as a context-aggregation layer over Liferay's APIs — one call returns what otherwise takes several.
---

# Discovery

Discovery is about getting the relevant portal context in as few commands as
possible, before changing anything.

`ldev` does not invent a new portal API. It wraps the existing ones —
Liferay's Headless API, JSONWS, and the local runtime — and returns
consolidated, structured snapshots. One call to `portal inventory page`
typically returns what would otherwise require several Headless API calls
plus glue code.

That makes it useful in three places:

- a developer opening a portal for the first time
- an incident triage flow
- an AI agent that needs full context before suggesting any action

## Portal context

The four most useful inventory entry points:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
ldev portal inventory structures --site /global --with-templates --json
```

Each one consolidates information that the Headless API only returns in
fragments. Highlights:

- `inventory sites` — accessible sites with the identifiers needed for deeper
  inspection, optionally with content volume metrics
- `inventory pages` — full page hierarchy for a site, with friendly URLs
- `inventory page` — for a single URL, the resolved layout, fragments,
  widgets and journal articles in one structured response
- `inventory structures --with-templates` — structures enriched with their
  associated templates in one call, the right starting point for
  structure/template work

## Preflight: fail fast before long flows

```bash
ldev portal inventory preflight
ldev portal inventory preflight --force-refresh
```

Preflight checks that the API surfaces (admin Site, admin User, JSONWS) are
reachable with the current OAuth credentials. The result is cached. Attach
preflight as a pre-hook to any inventory or resource flow:

```bash
ldev portal inventory --preflight sites --json
ldev resource --preflight export-structures --all-sites
```

## Runtime context

```bash
ldev context --json
ldev status --json
ldev doctor --json
ldev ai bootstrap --intent=discover --json
```

These tell you which repo and runtime `ldev` resolved, whether services are
healthy, and which command areas are ready right now.

`ldev context` is the canonical offline snapshot — it does not contact
Docker or the portal. `ldev ai bootstrap --intent=discover` wraps the same
snapshot in the agent-facing shape; it is the standard entrypoint for
agents.

## Why discovery comes first

Most maintenance mistakes happen because someone changed the system before
they understood it. Discovery first means:

1. you know which environment you are targeting
2. you know which portal object you are looking at
3. you know whether the problem is portal, runtime, data or OSGi related

It is also the cheapest way to give an agent enough context to do something
useful without guessing.
