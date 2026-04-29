---
title: Explore a Portal
description: Discover sites, pages, and page structure without depending on the Liferay UI.
---

# Explore a Portal

Portal discovery is a core `ldev` workflow.

Use it when:

- the UI is unavailable
- you need a fast inventory of sites and pages
- you want structured output for automation
- an agent needs context before changing anything
- you need to know which Pages use a shared portal resource before changing it

## Start with sites

```bash
ldev portal inventory sites
ldev portal inventory sites --json
```

This gives you a quick list of accessible sites and the identifiers you need for deeper inspection.

Real example:

```json
[
  {
    "groupId": 20126,
    "siteFriendlyUrl": "/guest",
    "name": "Guest",
    "pagesCommand": "inventory pages --site /guest"
  },
  {
    "groupId": 20120,
    "siteFriendlyUrl": "/global",
    "name": "Global",
    "pagesCommand": "inventory pages --site /global"
  }
]
```

## Move into page hierarchy

```bash
ldev portal inventory pages --site /global
ldev portal inventory pages --site /global --json
```

Use this to understand navigation, page depth, and available routes without opening the site in a browser.

Real example for the default Guest site:

```bash
ldev portal inventory pages --site /guest --json
```

```json
{
  "siteName": "Guest",
  "siteFriendlyUrl": "/guest",
  "sitePathPrefix": "/web/guest",
  "pageCount": 2,
  "pages": [
    {
      "name": "Home",
      "friendlyUrl": "/home",
      "fullUrl": "/web/guest/home"
    },
    {
      "name": "Search",
      "friendlyUrl": "/search",
      "fullUrl": "/web/guest/search"
    }
  ]
}
```

## Inspect one page directly

```bash
ldev portal inventory page --url /home --json
```

If you know the site and friendly URL separately:

```bash
ldev portal inventory page --site /global --friendly-url /home --json
```

Real example:

```bash
ldev portal inventory page --url /web/guest/home --json
```

```json
{
  "siteName": "Guest",
  "url": "/web/guest/home",
  "pageName": "Home",
  "componentInspectionSupported": true,
  "fragmentEntryLinks": [
    {
      "type": "fragment",
      "fragmentKey": "BASIC_COMPONENT-paragraph"
    },
    {
      "type": "fragment",
      "fragmentKey": "BASIC_COMPONENT-image"
    }
  ],
  "widgets": [],
  "journalArticles": []
}
```

## Why this matters

This workflow is different from manual UI exploration:

- no UI dependency
- instant understanding of site and page structure
- structured output that can be piped, diffed, or stored
- usable by humans and agents in the same way

## Reverse lookup from a resource

Once you know the resource key, `where-used` gives you the part that the UI is
usually bad at: impact analysis across Pages.

```bash
ldev portal inventory where-used --type fragment --key card-hero --site /guest --json
ldev portal inventory where-used --type structure --key BASIC --site /guest --json
ldev portal inventory where-used --type adt --key UB_ADT_STUDIES_SEARCH --site /global --json
```

Prefer the scoped form with `--site` unless you really need a cross-site scan.

Use it for questions like:

- which Pages contain this Fragment
- which Pages render Journal content through this widget
- which Pages depend on this Structure or Template
- which Pages are tied to this ADT before I edit it

## Typical discovery flow

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
ldev portal inventory where-used --type structure --key BASIC --site /global --json
```

End with the exact page, site, and route context you need before you diagnose or change anything else.
