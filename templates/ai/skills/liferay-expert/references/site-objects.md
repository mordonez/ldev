# Site-Level Objects

## Display Page Templates

`ldev portal inventory page --url <url> --json` exposes Display Page Template
metadata directly in the default output. No MCP or separate lookup is needed for
the most common discovery tasks.

For a display page URL, the result includes:

- `page.type: "displayPage"` — confirms the page type
- `article.*` — article `id`, `key`, `title`, `structureKey`, `externalReferenceCode`, `uuid`
- `rendering.displayPageDefaultTemplate` — the active Display Page Template key
- `rendering.displayPageDdmTemplates` — DDM template keys bound to the display page template
- `rendering.widgetDefaultTemplate` — fallback widget template key
- `taxonomy.categories` — category names applied to the article
- `lifecycle.*` — `availableLanguages`, `dateCreated`, `dateModified`, `datePublished`, `neverExpire`

For the full raw data (all content fields, all template candidates, all taxonomy briefs):

```bash
ldev portal inventory page --url <url> --json --full
```

`full.articleDetails.displayPageTemplateCandidates` lists every compatible Display Page
Template key. `full.articleDetails.contentFields` contains all structured content fields.
`full.contentStructures` exposes the owning structure with its `exportPath`.

For Display Page Template resource management not yet exposed by `ldev` (creating,
configuring), verify MCP availability:

```bash
ldev mcp check --json
```

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

See also: `../../developing-liferay/references/structures.md` for the full
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
   # bash/zsh (requires jq)
   ldev mcp openapis --json | jq -r '.[] | select(.name | test("translation"; "i")) | .name'
   ```

   ```powershell
   ldev mcp check --json
   (ldev mcp openapis --json | ConvertFrom-Json) |
     Where-Object { $_.name -match 'translation' } |
     Select-Object -ExpandProperty name
   ```
