---
title: First Incident
description: A practical walkthrough of triaging a Liferay issue with ldev — without overstating what each command does.
---

# First Incident

Scenario: the portal starts, but `/home` is failing and users report errors
after a module deployment.

This page walks through how `ldev` helps you triage that, with honest
expectations about what each command actually does.

## What ldev gives you in this flow

- a fast way to **check that the environment itself is sane** (`doctor`)
- a way to **group recent exceptions** in the logs by type and frequency
  (`logs diagnose`) — this is regex-driven aggregation, not deep diagnosis
- **consolidated portal context** for the affected page (`portal inventory
  page`)
- **bundle state** lookups that wrap Gogo Shell (`osgi status|diag`)
- **targeted redeploy** of one module (`deploy module`)
- **structured evidence** to verify the result

## 1. Confirm the environment is healthy

```bash
ldev start
ldev status
ldev doctor
```

`doctor` checks tools, ports, memory, configuration files, and (with
`--runtime`/`--portal`/`--osgi`) optional probes for Compose state, an HTTP
hit on the portal, and a Gogo bundle summary.

If any of those fail, fix them first. There is no point in chasing
application errors against a broken environment.

## 2. Group recent exceptions

```bash
ldev logs diagnose --since 10m --json
```

This reads recent Docker Compose logs, groups exceptions by class with regex,
counts warnings, and applies a small set of keyword rules to suggest possible
causes. It is fast and useful for triage, but treat the suggestions as
hints, not diagnoses.

Capture any bundle symbolic name that appears repeatedly in the output.
You will use it next.

## 3. Get the page in context

```bash
ldev portal inventory page --url /home --json
```

This consolidates several Headless API calls into a single response: the
resolved layout, fragments, widgets and articles on the page. If the UI is
broken, you can still see the page's structure from here.

## 4. Inspect the bundle the logs pointed at

```bash
ldev osgi status com.acme.foo.web
ldev osgi diag com.acme.foo.web
```

These commands wrap Gogo Shell. `status` shows whether the bundle is
`Active`, `Resolved`, or `Installed`. `diag` runs Liferay's `diag` Gogo
command on the bundle id and surfaces unsatisfied references.

Common readings:

- `Active` → the bundle is fine; the problem is probably config, data, or a
  caller, not the bundle itself
- `Resolved` or `Installed` → a dependency is missing
- `diag` flags an unsatisfied reference → fix or deploy the missing module

## 5. Apply a targeted fix

If the issue is in one module, redeploy only that module:

```bash
ldev deploy module foo-web
```

If runtime state is stale even after deployment, refresh:

```bash
ldev env restart
```

Avoid `deploy all` unless a full rebuild is justified.

## 6. Verify

```bash
ldev portal check
ldev portal inventory page --url /home --json
ldev logs diagnose --since 5m --json
```

You are done when:

- `portal check` succeeds
- the page resolves cleanly
- the original exception no longer appears in a fresh diagnosis window

## What this flow is, and is not

This is convenience triage, done well. `ldev` does not magically diagnose
Liferay for you — it gives you a fast loop with structured evidence at each
step, so you spend time thinking about the problem instead of pasting log
fragments into chat.

The bigger value of `ldev` lives in workflows you cannot do at all without
it — see [Export and Import Resources](/workflows/export-import-resources)
and [Resource Migration Pipeline](/workflows/resource-migration-pipeline).
