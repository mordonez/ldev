---
title: Explore a Portal
description: Get the consolidated portal context in one structured call — sites, pages, fragments, articles — without navigating the UI.
---

# Explore a Portal

`ldev portal inventory` is the context-aggregation surface of the CLI.

A single call to `inventory page` returns the resolved layout, fragments,
widgets and articles for a URL — information that, against the Headless API
directly, would take several calls and glue code. The inventory commands
exist because that consolidated context is what a developer or an agent
actually needs in the first ten seconds of looking at a portal.

Use it when:

- the UI is unavailable
- you want a fast inventory of sites and pages
- you need structured output for automation
- an agent needs context before changing anything

## Start with sites

```bash
ldev portal inventory sites
ldev portal inventory sites --json
```

This returns the accessible sites and the identifiers needed for deeper
inspection.

Real output:

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

## Move into the page hierarchy

```bash
ldev portal inventory pages --site /global
ldev portal inventory pages --site /global --json
```

Use this to understand navigation, depth and available routes without
opening the site in a browser.

Real output:

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

## Inspect one page in full context

```bash
ldev portal inventory page --url /home --json
```

If you know site and friendly URL separately:

```bash
ldev portal inventory page --site /global --friendly-url /home --json
```

Real output:

```json
{
  "siteName": "Guest",
  "url": "/web/guest/home",
  "pageName": "Home",
  "componentInspectionSupported": true,
  "fragmentEntryLinks": [
    { "type": "fragment", "fragmentKey": "BASIC_COMPONENT-paragraph" },
    { "type": "fragment", "fragmentKey": "BASIC_COMPONENT-image" }
  ],
  "widgets": [],
  "journalArticles": []
}
```

This is the consolidated view — fragments, widgets and articles in one
response.

## Why this workflow matters

`ldev portal inventory` is honest convenience. It does not give you a portal
API that Liferay does not have; it composes the existing Headless API into
the shape you actually want to read.

The benefit is twofold:

- a developer or support engineer skips the UI entirely
- an AI agent gets in one tool call what would otherwise need several, with
  matching JSON shape across MCP and CLI

## Typical discovery flow

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
```

End with the exact page, site and route context you need before you change
anything.
