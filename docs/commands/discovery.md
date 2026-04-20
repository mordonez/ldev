---
title: Discovery Commands
description: Minimal reference for understanding portal and runtime state.
---

# Discovery Commands

Namespace-scoped connection overrides are available for remote execution on `ldev portal` and `ldev resource`:

```bash
ldev portal --liferay-url https://portal.example.com inventory sites --json
```

## `ldev context`

Resolve repo, runtime, and Liferay context as one snapshot.

```bash
ldev context
ldev context --json
```

`context` is the entry point for humans and agents: it returns repo root, worktree, compose project name, resolved portal URL, and which command areas are ready.

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
checkedPath=/o/headless-admin-user/v1.0/my-user-account
status=200
tokenType=Bearer
expiresIn=600
```

## `ldev portal auth token`

Fetch an OAuth2 access token for scripting.

```bash
ldev portal auth token
ldev portal auth token --raw
```

`--raw` prints only the access token in text mode, so it can be captured for shell variables.

## `ldev portal inventory preflight`

Check whether the portal's admin/JSONWS API surfaces are reachable with the current credentials. Used to fail fast before running longer inventory or resource flows.

```bash
ldev portal inventory preflight
ldev portal inventory preflight --force-refresh
```

The result is cached; `--force-refresh` bypasses the cache. You can also attach preflight as a pre-hook to any inventory or resource subcommand with `--preflight`:

```bash
ldev portal inventory --preflight sites --json
ldev resource --preflight export-structures --all-sites
```

## `ldev portal inventory sites`

List accessible sites, or switch into folder inventory mode when a site is selected.

```bash
ldev portal inventory sites
ldev portal inventory sites --json
ldev portal inventory sites --with-content --sort-by content
ldev portal inventory sites --site /estudis --with-structures --limit 20
ldev portal inventory sites --group-id 2710030 --with-structures
```

Options:

- `--page-size <n>` — JSONWS page size (default `200`)
- `--with-content` — include Journal content volume metrics
- `--sort-by site|name|content` — sort order (default `site`)
- `--limit <n>` — max sites to return in content mode
- `--site <friendlyUrl>` — inspect one site (switches to folder inventory)
- `--group-id <id>` — inspect one site by numeric group id
- `--with-structures` — include per-folder structure breakdowns when scoped
- `--exclude-site <site>` — exclude a site from content metrics (repeatable)

## `ldev portal inventory pages`

List pages in a site hierarchy.

```bash
ldev portal inventory pages --site /global
ldev portal inventory pages --site /guest --private-layout
ldev portal inventory pages --site /global --max-depth 4 --json
```

## `ldev portal inventory page`

Inspect a specific page or display page.

```bash
ldev portal inventory page --url /home --json
ldev portal inventory page --url /web/guest/home --json
ldev portal inventory page --site /global --friendly-url /home --json
ldev portal inventory page --url /home --verbose
```

`--verbose` includes fragment/widget element names, CSS classes, and custom CSS.

## `ldev portal inventory structures`

List journal structures for a site or for every site.

```bash
ldev portal inventory structures --site /global --json
ldev portal inventory structures --site /global --with-templates --json
ldev portal inventory structures --all-sites --with-templates --json
```

Prefer `--with-templates` as the first discovery step for structure/template incidents: it returns structures enriched with their associated templates in one call.

## `ldev portal inventory templates`

List web content templates for a site.

```bash
ldev portal inventory templates --site /global --json
```

## `ldev portal audit`

Minimal runtime audit of accessible site metadata and API reachability. Defaults to JSON.

```bash
ldev portal audit
ldev portal audit --site /global --page-size 200
```

## `ldev portal config get|set`

Inspect and update local Liferay config files (portal properties and OSGi PIDs).

```bash
ldev portal config get com.liferay.portal.search.elasticsearch7.configuration.ElasticsearchConfiguration
ldev portal config get companyDefaultLanguageId --source effective
ldev portal config set com.liferay.portal.search.... --key networkHostAddresses --value '["host:9200"]'
```

`--source` defaults to `source` for `set` and `effective` for `get`.

## `ldev oauth install`

Create or refresh the OAuth app used by `ldev` and optionally persist credentials locally.

```bash
ldev oauth install --write-env
ldev oauth install --write-env --scope-profile default
ldev oauth install --company-id 20097 --user-id 20130 --write-env
```

Use this once after the portal is ready. The local credentials are written to `.liferay-cli.local.yml`. See [OAuth](/core-concepts/oauth) for the full model, including scope profiles and manual remote setup.

## `ldev oauth admin-unblock`

Clear the initial password-reset state for the selected admin user, so OAuth flows that create/update the OAuth app can succeed.

```bash
ldev oauth admin-unblock
ldev oauth admin-unblock --company-id 20097 --user-id 20130
```
