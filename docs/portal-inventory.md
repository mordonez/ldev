# Portal Inventory (`ldev portal inventory`)

Use `portal inventory` to inspect what is running in a Liferay instance without opening the admin UI.

It is especially useful for:

- fast discovery before implementing or debugging
- understanding page trees and URL routing
- inspecting page composition (fragments/widgets)
- extracting display-page article fields in machine-readable JSON

## 1) List sites

```bash
ldev portal inventory sites
```

Example text output (sanitized):

```text
- id=91001 site=/engineering name=Engineering Hub pages=inventory pages --site /engineering
- id=91002 site=/newsroom name=Newsroom pages=inventory pages --site /newsroom
- id=91003 site=/students name=Students Portal pages=inventory pages --site /students
```

JSON output:

```bash
ldev portal inventory sites --json
```

```json
[
  {
    "groupId": "91001",
    "siteFriendlyUrl": "/engineering",
    "name": "Engineering Hub",
    "pagesCommand": "inventory pages --site /engineering"
  },
  {
    "groupId": "91002",
    "siteFriendlyUrl": "/newsroom",
    "name": "Newsroom",
    "pagesCommand": "inventory pages --site /newsroom"
  }
]
```

## 2) List pages for one site

```bash
ldev portal inventory pages --site /engineering
```

Example text output (sanitized):

```text
inspectCommandTemplate=inventory page --url <fullUrl>
- Home [portlet] /web/engineering/home
  - Announcements [portlet] /web/engineering/announcements
- Programs [content] /web/engineering/programs
  - Masters Catalog [url] /web/engineering/masters -> https://example.edu/masters
```

JSON output:

```bash
ldev portal inventory pages --site /engineering --json
```

```json
{
  "inventoryType": "pages",
  "groupId": 91001,
  "siteName": "Engineering Hub",
  "siteFriendlyUrl": "/engineering",
  "sitePathPrefix": "/web/engineering",
  "inspectCommandTemplate": "inventory page --url <fullUrl>",
  "pageCount": 12,
  "pages": [
    {
      "pageSubtype": "portlet",
      "name": "Home",
      "fullUrl": "/web/engineering/home",
      "pageCommand": "inventory page --url /web/engineering/home",
      "children": []
    }
  ]
}
```

## 3) Inspect one page deeply

```bash
ldev portal inventory page --url /web/engineering/programs
```

### Regular/content page example (text)

```text
REGULAR PAGE
site=Engineering Hub
siteFriendlyUrl=/engineering
groupId=91001
url=/web/engineering/programs
pageName=Programs
layoutType=content
FRAGMENTS (2)
1. eng-hero
   [title] Study Engineering
2. eng-links
   [item-1] Undergraduate
   [item-2] Graduate
```

### Display page example (text)

```bash
ldev portal inventory page --url /web/newsroom/w/scholarship-results
```

```text
DISPLAY PAGE
site=Newsroom
siteFriendlyUrl=/newsroom
groupId=91002
url=/web/newsroom/w/scholarship-results
articleId=550101
articleKey=550099
articleTitle=Scholarship results 2026
contentField Headline=Scholarship results are now available
contentField Summary=Published after committee approval.
```

JSON output:

```bash
ldev portal inventory page --url /web/newsroom/w/scholarship-results --json
```

```json
{
  "pageType": "displayPage",
  "pageSubtype": "journalArticle",
  "siteName": "Newsroom",
  "siteFriendlyUrl": "/newsroom",
  "url": "/web/newsroom/w/scholarship-results",
  "article": {
    "id": 550101,
    "key": "550099",
    "title": "Scholarship results 2026"
  },
  "articleProperties": {
    "contentFields": [
      { "path": "Headline", "type": "string", "value": "Scholarship results are now available" },
      { "path": "Summary", "type": "string", "value": "Published after committee approval." }
    ]
  }
}
```

## Practical usage tips

- Start with `sites`, then narrow to `pages`, then inspect with `page`.
- Use `--json` for scripts, CI, and AI-agent sessions.
- Use the `pageCommand`/`inspectCommandTemplate` values to recurse programmatically.

## Related docs

- [Key Capabilities](/capabilities)
- [Command Reference](/commands)
- [AI Workflows](/ai-workflows)
- [Automation](/automation)
