---

description: Portal discovery guidance using `ldev portal inventory`
globs: *
alwaysApply: false

---

# `ldev` Portal Discovery

For discovery tasks, prefer `ldev portal inventory` before constructing
low-level API flows by hand.

Recommended sequence:

1. `ldev portal inventory sites --json`
2. `ldev portal inventory pages --site /my-site --json`
3. `ldev portal inventory page --url /web/my-site/home --json`
4. `ldev portal inventory where-used --type structure --key <STRUCTURE_KEY> --site /my-site --json` when the task asks where a resource is used

Why:

- task-shaped output
- stable JSON contract
- better page/context enrichment than low-level API assembly
- direct reverse lookup for portal resources without UI searching

The default output is minimal and suitable for most discovery tasks. Use `--full` when
you need raw data not present by default:

```bash
ldev portal inventory page --url /web/my-site/home --json --full
```

- For **display pages**: `full.articleDetails.contentFields`, all template candidates,
  all `renderedContents`, `full.contentStructures` with `exportPath`.
- For **regular pages**: `full.configurationRaw` (full `sitePageMetadata` + `pageDefinition`),
  `full.components.fragments` (with `editableFields` and `heroText`).

Use `where-used` when the task starts from a known resource key instead of a
known URL. It is the preferred route for questions like “which Pages use this
Structure, Template, ADT, widget, or Fragment?”

Default to the scoped form with `--site`. A global scan across all accessible
Sites is slower and should be reserved for tasks that explicitly need it.

For the full workflow, route to vendor skills such as:

- `liferay-expert`
- `developing-liferay`
- `troubleshooting-liferay`

Use MCP or direct OpenAPI work only when `ldev` does not already expose the
needed portal action cleanly.
