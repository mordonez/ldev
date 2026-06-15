# Resource Origin

Use this when a functional change touches Journal resources and the affected runtime surface does not map cleanly to one site.

General rules:

- Shared structures may live in a global or shared site even when the visible URL belongs to a concrete site.
- The runtime URL may belong to a concrete site even when the editable source of truth lives in a different site.
- Verify each resource origin before editing or importing.
- Resolve the source-of-truth site before the first edit. The source-of-truth
  site is the site that owns the resource file agents should change and the
  resource agents should import for the issue.
- When several directories contain files with the same structure or template
  key, treat sibling directories as candidate copies only. Those candidate
  copies are out of scope until proven active by page inventory, resource
  inventory, project context, or an explicit user instruction.
- In short: candidate copies are out of scope until proven active.

Minimum discovery sequence:

```bash
ldev portal inventory page --url <fullUrl> --full --json
ldev portal inventory sites --json
ldev resource export-structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource export-template --site /<site> --template <TEMPLATE_ID>
```

Do not assume the site in the browser URL is the same site that owns the
structure or template source files. Always resolve the owning site from the
full inventory before making changes. For visible Journal rendering, prefer
`templateExportPath` and `displayPageDdmTemplates` over grep results.

Do not edit sibling site copies just because `rg` found the same key under
multiple site folders. Add them to the scope only when the issue mentions those
sites or the runtime inventory proves that the affected page uses those copies.
