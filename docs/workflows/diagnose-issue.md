---
title: Diagnose an Issue
description: Use ldev to identify whether a Liferay problem is environment, application, portal, or OSGi related.
---

# Diagnose an Issue

Use this flow when the symptom is vague:

- the portal is slow
- a page fails to load
- deployments stop working
- startup does not complete

## 1. Confirm environment health

```bash
ldev status --json
ldev doctor --json
```

If Docker, ports, activation, or effective config are broken, fix that first. Do not spend time in portal APIs before the environment is healthy enough to trust.

## 2. Group the recent errors

```bash
ldev logs diagnose --since 15m --json
```

This is the fastest way to move from raw logs to a shortlist of likely causes.

## 3. Check API reachability

```bash
ldev portal check --json
```

If this fails, the issue may be authentication, startup, or basic portal reachability rather than page-specific behavior.

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

Use `deploy module` before broader rebuilds. Restart only when the runtime state needs to be refreshed.

If deploy output reports that only some artifacts were hot-deployed, treat it as a failed deploy and retry after checking the reported artifact errors.

## 6. Verify

```bash
ldev portal check
ldev logs diagnose --since 5m --json
```

Verification is complete when the user-facing symptom is gone and the error no longer appears in a fresh diagnosis window.
