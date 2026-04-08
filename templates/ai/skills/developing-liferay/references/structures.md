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

## Recommended flow

1. Discover first in portal:

```bash
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
ldev resource adt --display-style ddmTemplate_<ID> --site /<site> --json
```

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

## Guardrails

- Do not guess keys or IDs
- Do not make destructive structure changes on live content without a migration plan
- If the risk is data migration, switch to `migrating-journal-structures`
