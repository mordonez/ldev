# Field Selection for Inventory Commands

Liferay API responses include 20-80 fields per object. This reference lists the minimal fields
needed for common agent tasks. Extract only these before forwarding output to reasoning.

## Sites

Command: `ldev portal inventory sites --json`

| Task | Fields needed |
|---|---|
| Identify a site | `siteFriendlyUrl`, `siteName` |
| List all sites | `siteFriendlyUrl`, `siteName`, `siteId` |
| Check content volume | `siteFriendlyUrl`, `contentStats.articleCount` |

jq example:
```bash
ldev portal inventory sites --json | jq '[.[] | {siteFriendlyUrl, siteName}]'
```

## Structures

Command: `ldev portal inventory structures --site /<site> --json`

| Task | Fields needed |
|---|---|
| Find a structure | `key`, `name` |
| List structures for selection | `key`, `name`, `siteFriendlyUrl` |
| Cross-site lookup | `key`, `name`, `siteFriendlyUrl` |

jq example:
```bash
ldev portal inventory structures --site /estudis --json | jq '[.sites[0].structures[] | {key, name}]'
```

## Templates

Command: `ldev portal inventory templates --site /<site> --json`

| Task | Fields needed |
|---|---|
| Find a template | `key`, `name` |
| Find template for a structure | `key`, `name`, `structureKey` |

## Pages

Command: `ldev portal inventory pages --site /<site> --json`

| Task | Fields needed |
|---|---|
| List page URLs | `friendlyUrlPath`, `name` |
| Find a page | `friendlyUrlPath`, `name`, `type` |

## Fragments

Command: `ldev resource fragments --site /<site> --json`

| Task | Fields needed |
|---|---|
| Find a fragment | `fragmentKey`, `name`, `collectionName` |
| List collections | `collectionKey`, `collectionName`, `fragmentCount` |

## ADTs

Command: `ldev resource adts --site /<site> --json`

| Task | Fields needed |
|---|---|
| Find an ADT | `templateKey`, `name`, `widgetType` |
| List ADTs for a widget | `templateKey`, `name`, `widgetType` |

## Page Detail (Deep)

Command: `ldev portal inventory page --url <fullUrl> --full --json`

This returns a large object. Filter to relevant sections:

| Task | Fields needed |
|---|---|
| Identify fragments on page | `fragments[].fragmentKey`, `fragments[].name` |
| Identify structure rendered | `journalArticles[].structureKey` |
| Identify display page template | `displayPageDefaultTemplate` |
| Identify portlets/widgets | `portlets[].portletId` |
