# Portal Inventory

Use `ldev portal inventory` to discover what's running in a Liferay instance without the admin UI.

## Quick Reference

```bash
# List all sites
ldev portal inventory sites --json

# List pages in a site
ldev portal inventory pages --site /my-site --json

# Inspect a specific page
ldev portal inventory page --url /web/my-site/home --json

# List structures/templates
ldev portal inventory structures --site /my-site --json
ldev portal inventory templates --site /my-site --json
```

---

## Use Cases

- **Discovery**: Understand site/page structure before implementation
- **Debugging**: Find which page contains which content
- **Inspection**: Extract page composition (fragments, widgets, fields)
- **Scripting**: Use `--json` output in CI/AI workflows

---

## 1) List Sites

```bash
ldev portal inventory sites
ldev portal inventory sites --json
```

Returns:
- Site ID, friendly URL, name
- Commands to drill deeper

---

## 2) List Pages for a Site

```bash
ldev portal inventory pages --site /my-site --json
```

Returns:
- Page names, types (portlet/content/display), URLs
- Hierarchy (parents/children)
- Commands to inspect each page

---

## 3) Inspect a Specific Page

```bash
ldev portal inventory page --url /web/my-site/home --json
```

Returns:
- Page type and layout
- Fragments and their configuration
- Widgets (portlets) on the page
- Display page articles and content fields

**Example output:**

```json
{
  "pageType": "content",
  "siteName": "My Site",
  "url": "/web/my-site/home",
  "fragments": [
    {
      "name": "hero-banner",
      "editUrl": "http://localhost:8080/c/portal/layout?..."
    }
  ],
  "portlets": [
    {
      "title": "Recent Posts",
      "instanceId": "..."
    }
  ]
}
```

---

## 4) List Structures & Templates

```bash
ldev portal inventory structures --site /my-site
ldev portal inventory templates --site /my-site
```

Useful for:
- Understanding content types
- Planning resource migrations
- Identifying what needs to be exported

---

## Workflow Tips

1. Start: `ldev portal inventory sites`
2. Pick: `ldev portal inventory pages --site /chosen-site`
3. Inspect: `ldev portal inventory page --url /specific-page`
4. Export: `ldev resource export-structures --site /chosen-site`

Use `--json` in scripts and agent sessions.

---

## See Also

- [Commands Reference](/commands#portal-commands)
- [Resource Migration Pipeline](/resource-migration-pipeline)
- [Automation](/automation) — JSON output contract
