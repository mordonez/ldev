---
title: Diagnose an Issue
description: A practical triage flow with ldev — useful for routing to the right area, with honest expectations about what each command does.
---

# Diagnose an Issue

Use this flow when the symptom is vague:

- the portal is slow
- a page fails to load
- deployments stop working
- startup does not complete

The goal is to route the problem to the right area — environment,
application, portal or OSGi — quickly, with structured evidence at each
step.

A note up front: `ldev` does not diagnose Liferay magically. `logs diagnose`
groups exceptions with regex and applies a small set of keyword rules,
`doctor` checks environment readiness, `osgi diag` wraps Gogo. They are
fast convenience over things you would otherwise do by hand. The win is
speed and structured output, not insight.

## 1. Confirm environment health

```bash
ldev status --json
ldev doctor --json
ldev doctor --runtime --portal --osgi --json
```

If Docker, ports, activation, or effective config are broken, fix that
first. There is no point chasing application errors against a broken
environment.

## 2. Group the recent errors

```bash
ldev logs diagnose --since 15m --json
```

This is the fastest way to move from raw logs to a shortlist of likely
causes. Use it as a triage signal, not as a diagnosis.

## 3. Check API reachability

```bash
ldev portal check --json
```

If this fails, the issue is probably authentication, startup, or basic
portal reachability — not page-specific behavior.

## 4. Inspect the affected area

If the problem is a page:

```bash
ldev portal inventory page --url /home --json
```

If the problem is site-level navigation:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
```

If the problem is a module:

```bash
ldev osgi status com.acme.foo.web
ldev osgi diag com.acme.foo.web
```

## 5. Apply the smallest fix

Examples:

```bash
ldev deploy module foo-web
ldev env restart
```

Use `deploy module` before broader rebuilds. Restart only when runtime state
needs to be refreshed.

If deploy output reports that only some artifacts were hot-deployed, treat
it as a failed deploy and retry after fixing the reported artifact errors.

## 6. Verify

```bash
ldev portal check
ldev logs diagnose --since 5m --json
```

Verification is complete when the user-facing symptom is gone and the
original error no longer appears in a fresh diagnosis window.
