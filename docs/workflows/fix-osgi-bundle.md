---
title: Fix an OSGi Bundle
description: Triage and repair an unresolved or failing OSGi bundle in a local Liferay environment, using ldev wrappers around Gogo Shell.
---

# Fix an OSGi Bundle

Use this workflow when a deployment completed but the feature still fails.

`ldev osgi status` and `ldev osgi diag` are convenience wrappers around
Gogo Shell. They do not replace OSGi diagnostics; they make them faster to
run from a normal terminal and give you structured output you can pipe.

## Problem

A module was deployed, but the page still errors or the feature is missing.

## 1. Find the bundle name

Start from the recent error:

```bash
ldev logs diagnose --since 10m --json
```

`logs diagnose` groups exceptions and gives you a shortlist. Capture the
bundle symbolic name from the stack trace or component error. Example:
`com.acme.foo.web`.

## 2. Inspect bundle state

```bash
ldev osgi status com.acme.foo.web
ldev osgi diag com.acme.foo.web
```

What to look for:

- unresolved package imports
- unsatisfied declarative-services references
- a bundle stuck after deployment

These are pass-throughs of Gogo `lb -s <filter>` and `diag <bundleId>` with
formatting on top.

## 3. Rebuild and redeploy only the affected module

```bash
ldev deploy module foo-web
```

If the issue is in a theme:

```bash
ldev deploy theme
```

## 4. Refresh the runtime if needed

```bash
ldev env restart
```

Use a restart when the deployment succeeded but the runtime has not
recovered cleanly.

## 5. Verify the fix

```bash
ldev osgi status com.acme.foo.web
ldev portal check
ldev logs diagnose --since 5m --json
```

End state:

- the bundle is `Active`
- `portal check` succeeds
- the original exception no longer repeats
