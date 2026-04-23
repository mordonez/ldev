# Site-Level Objects

## Display Page Templates

`ldev` does not expose dedicated Display Page Template commands yet.
Verify MCP availability and use it for inspection:

```bash
ldev mcp check --json
```

If MCP is available, use OpenAPI discovery to find the relevant endpoint.
Without MCP, `ldev portal inventory page --url <url> --json` can still confirm
whether the URL resolves as a display page (`pageType: displayPage`) and which
article/structure it serves, but it does not expose dedicated Display Page
Template metadata yet.

## Navigation Menus

`ldev` does not expose dedicated Navigation Menu commands yet.
Use `ldev mcp check --json` to verify MCP availability and route through
the headless delivery API (`/o/headless-delivery/v2.0/navigation-menus`).

For browser issue reproduction, if the project provides localized admin menu maps
under `docs/ai/menu/*.i18n.json`, prefer those direct paths instead of ad hoc
UI clicking. Resolve placeholders from:

- `ldev context --json` (`liferay.portalUrl`)
- `ldev portal inventory sites --json` (`siteFriendlyUrl`, `groupId`)

## Multi-Site Resource Origin

Structures and templates are not always owned by the site visible in the
browser URL. Shared or global structures live in `/global` or a shared site.

Always verify the owning site before editing or importing:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory structures --site /global --with-templates --json
ldev portal inventory structures --site /<site> --with-templates --json
```

Use `--with-templates` to get the structure-template relationship in one
inventory pass before choosing export/import commands.

Do not assume the browser URL site is the source of truth. Export from the
site that actually owns the object.

See also: `../developing-liferay/references/structures.md` for the full
export/import workflow.

## Content Volume

When investigating large datasets after a production import:

```bash
ldev portal inventory sites --with-content --sort-by content
ldev portal inventory sites --site /<site> --with-structures --limit 20
```

If volume is too high for local work, route to `troubleshooting-liferay`
for the post-import content prune workflow.

For per-article version accumulation or empty language version cleanup,
see `../../troubleshooting-liferay/references/content-versions.md`.

## Translation Export Limitations

`ldev` does not expose a direct wrapper for Liferay's built-in
"Exporta per traduir" (Export for Translation) feature.

If the translation export from the portal UI is failing:

1. Verify the content item is in `APPROVED` state — draft content cannot be exported for translation.
2. Check that the article is not in a workflow `PENDING` state (see `../../developing-liferay/references/workflow.md`).
3. For **web content**, the export uses the publication language set on the article.
   Stubs with empty language versions may prevent export of that locale.
4. For **fragments**, Liferay fragments with inline editable content support translation
   export, but only when the fragment collection is properly registered. Verify the
   fragment collection exists in the portal with:
   ```bash
   ldev resource fragments --site /<site> --json
   ```
5. If the portal exports nothing for a specific content type, use MCP to investigate:
   ```bash
   ldev mcp check --json
   ldev mcp openapis --json | jq '.[] | select(.name | test("translation"; "i")) | .name'
   ```
