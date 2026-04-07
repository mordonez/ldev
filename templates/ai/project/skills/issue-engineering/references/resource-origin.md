# Resource Origin

Use this when a functional change touches Journal resources and the affected runtime surface does not map cleanly to one site.

General rules:

- Shared structures may live in a global or shared site even when the visible URL belongs to a concrete site.
- The runtime URL may belong to a concrete site even when the editable source of truth lives in a different site.
- Verify each resource origin before editing or importing.

Minimum discovery sequence:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory sites --json
ldev resource export-structure --site /<site> --key <STRUCTURE_KEY>
ldev resource export-template --site /<site> --id <TEMPLATE_ID>
```

Do not assume the site in the browser URL is the same site that owns the structure or template source files. Always resolve the owning site from the inventory before making changes.
