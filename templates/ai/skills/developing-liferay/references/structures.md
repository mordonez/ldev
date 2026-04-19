# Structures, Templates and ADTs Reference

Use this reference for Journal structures, web content templates, and ADTs.

## Source of truth

- Structures: `liferay/resources/journal/structures/<site>/`
- Templates: `liferay/resources/journal/templates/<site>/`
- ADTs: `liferay/resources/templates/application_display/<site>/`

## Authoring structure JSON

When creating a new structure or editing `dataDefinitionFields` directly, use the
field type catalog to get the correct shape for each field:

Reference: `references/structure-field-catalog.md`

## Resolving the owning site

The structure or template owner is not always the site shown in the browser URL.
Shared structures often live in `/global` or a shared site even when the
visible content URL belongs to a concrete site.

Always verify before exporting or importing:

```bash
# Identify the page and its portlet context
ldev portal inventory page --url <fullUrl> --json

# Check global site first for shared resources
ldev portal inventory structures --site /global --with-templates --json
ldev portal inventory templates --site /global --json

# Then check the concrete site
ldev portal inventory structures --site /<site> --with-templates --json
ldev portal inventory templates --site /<site> --json
```

Do not assume the browser URL site owns the structure or template source files.
Export from the site that actually owns the object — importing to the wrong site
will create a duplicate instead of updating the intended one.

## Recommended flow

1. Discover first in portal:

```bash
ldev portal inventory structures --site /<site> --with-templates --json
ldev portal inventory templates --site /<site> --json
ldev resource adt --display-style ddmTemplate_<ID> --site /<site> --json
```

`--with-templates` is the fastest way to build a structure-template map for
issue triage and migration planning. Use `--page-size` only when you need to
override the default page size.

For a one-shot inventory across all sites:

```bash
ldev portal inventory structures --all-sites --with-templates --json
```

The JSON output is site-aware in both modes (`--site` and `--all-sites`) and
always returns a `sites` array with site metadata plus `summary` totals.

This is preferred over maintaining static structure-template catalogs in
project docs.

2. Export current state if needed:

```bash
ldev resource export-structure --site /<site> --key <STRUCTURE_KEY>
ldev resource export-template --site /<site> --id <TEMPLATE_ID>
ldev resource export-adt --site /<site> --id <ADT_ID>
```

3. Validate before mutating:

```bash
ldev resource import-structure --site /<site> --key <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --id <TEMPLATE_ID> --check-only
ldev resource import-adt --site /<site> --file <path/to/adt.ftl> --check-only
```

4. If validation is correct, rerun without `--check-only`

## Post-import verification (read-after-write)

Do not rely only on runtime logs for resource imports. Verify by reading the
current portal state after mutation:

```bash
# Structure: confirm current remote payload
ldev resource structure --site /<site> --key <STRUCTURE_KEY> --json

# Template: confirm current remote payload
ldev resource template --site /<site> --id <TEMPLATE_ID> --json

# ADT: confirm current remote payload
ldev resource adt --site /<site> --key <ADT_KEY> --json

# Cross-check mapping and ownership
ldev portal inventory structures --site /<site> --with-templates --json
ldev portal inventory templates --site /<site> --json
```

Use `ldev logs diagnose --since 5m --json` mainly for deploy/runtime issues
(modules/themes/startup faults), not as the primary signal for resource-import
success.

## Guardrails

- Do not guess keys or IDs
- Do not make destructive structure changes on live content without a migration plan
- If the risk is data migration, switch to `migrating-journal-structures`
