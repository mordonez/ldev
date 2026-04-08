---
title: Discovery Commands
description: Minimal reference for understanding portal and runtime state.
---

# Discovery Commands

## `ldev context`

Resolve repo, runtime, and Liferay context as one snapshot.

```bash
ldev context --json
```

## `ldev portal check`

Check OAuth and basic API reachability.

```bash
ldev portal check
ldev portal check --json
```

Real text-mode example:

```text
HEALTH_OK
baseUrl=http://localhost:8081
checkedPath=/o/headless-admin-site/v1.0/sites?pageSize=1
status=200
tokenType=Bearer
expiresIn=600
```

## `ldev portal inventory sites`

List accessible sites.

```bash
ldev portal inventory sites
ldev portal inventory sites --json
```

Typical default output includes `/guest` and `/global`.

## `ldev portal inventory pages`

List pages in a site hierarchy.

```bash
ldev portal inventory pages --site /global
```

## `ldev portal inventory page`

Inspect a specific page or route.

```bash
ldev portal inventory page --url /home --json
ldev portal inventory page --site /global --friendly-url /home --json
```

## Other inventory commands

```bash
ldev portal inventory structures --site /global --json
ldev portal inventory templates --site /global --json
```

## `ldev oauth install`

Create or refresh the OAuth app used by `ldev`.

```bash
ldev oauth install --write-env
```
