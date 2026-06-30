---
name: ldev-portal-inventory
description: 'Lists and resolves Liferay portal resources: sites, structures, templates, pages, fragments, and ADTs. Use when you need to discover what exists in the portal, resolve a site friendly URL, or find a structure or template key before editing or importing.'
---

# Portal Inventory

Discovery skill for portal resources. Run these commands to resolve what exists before editing, importing, or migrating.

## Bootstrap

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
```

Inspect: `context.liferay.portalUrl`, `context.liferay.auth.oauth2.clientId.status`.

## Sites

```bash
ldev portal inventory sites --json
```

Extract `siteFriendlyUrl` for the target site. Use it as `--site` in all subsequent commands.

For sites with content statistics:
```bash
ldev portal inventory sites --with-content --json
```

## Structures and Templates

```bash
# Structures for one site
ldev portal inventory structures --site /<site> --json

# Structures + templates together (most efficient for cross-lookup)
ldev portal inventory structures --with-templates --site /<site> --json

# Templates only
ldev portal inventory templates --site /<site> --json

# All sites (use when scope is unknown)
ldev portal inventory structures --with-templates --all-sites --json
```

Fields to extract: `key`, `name`. The `key` is what `--structure` and `--template` flags require.

## Pages

```bash
# Page tree for a site
ldev portal inventory pages --site /<site> --json

# Deep inspection of one page (fragments, widgets, display pages)
ldev portal inventory page --url <fullUrl> --full --json
```

Prefer `--site` for `pages` to avoid scanning all sites. Use `page --url` only when you have the exact full URL.

## ADTs

```bash
ldev resource adts --site /<site> --json
ldev resource adts --site /<site> --widget-type <type> --json
```

## Fragments

```bash
ldev resource fragments --site /<site> --json
```

## Impact Analysis (Where Used)

When you have a known key and need to know which pages use it:

```bash
ldev portal inventory where-used --key <key> --type <structure|template|fragment|adt> --json
```

This command scans all pages across all sites. It can take 2+ minutes on large portals.
**Confirm with the user before running** if the portal has more than 5 sites or 50 pages.

## Done When

Target resource is identified with its `key` (structures/templates/ADTs/fragments) or `siteFriendlyUrl` (sites). Never proceed with a guessed value.

## Field Selection Guide

See [references/field-selection.md](references/field-selection.md) for which fields to extract from each inventory command.

## Guardrails

- Always extract `siteFriendlyUrl` from inventory, never guess it.
- Prefer `--site` over `--all-sites` unless cross-site scope is required.
- Use `where-used` only with explicit user confirmation on large portals.
