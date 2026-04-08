---
title: Fix an OSGi Bundle
description: Diagnose and repair an unresolved or failing OSGi bundle in a local Liferay environment.
---

# Fix an OSGi Bundle

Use this workflow when a deployment completed but the feature still fails.

## Problem

A module was deployed, but the page still errors or the feature is missing.

## 1. Find the bundle name

Start from the recent error:

```bash
ldev logs diagnose --since 10m --json
```

Capture the bundle symbolic name from the stack trace or component error. Example: `com.acme.foo.web`.

## 2. Inspect bundle state

```bash
ldev osgi status com.acme.foo.web
ldev osgi diag com.acme.foo.web
```

What to look for:

- unresolved package imports
- unsatisfied declarative services references
- a bundle stuck after deployment

## 3. Rebuild and redeploy only the affected module

```bash
ldev deploy module foo-web
```

If the issue is in a theme instead:

```bash
ldev deploy theme
```

## 4. Refresh the runtime if needed

```bash
ldev env restart
```

Use a restart when the deployment succeeded but the runtime has not recovered cleanly.

## 5. Verify the fix

```bash
ldev osgi status com.acme.foo.web
ldev portal check
ldev logs diagnose --since 5m --json
```

End state:

- the bundle is active
- the portal responds
- the original exception no longer repeats
