---
name: ldev-resource-read
description: 'Reads the current state of a Liferay portal resource (structure, template, ADT, or fragment) directly from the running portal. Use when you need to inspect the live version of a resource before editing, comparing, or exporting it.'
---

# Resource Read

Reads portal resources from the running Liferay instance. Use this before editing or importing to understand the current live state of a structure, template, ADT, or fragment.

## Bootstrap

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
```

Inspect: `context.liferay.auth.oauth2.clientId.status` — must be `"present"`.

If you don't have the resource key yet, use `ldev-portal-inventory` first to discover it.

## Read a Journal Structure

```bash
ldev resource structure --site /<site> --structure <KEY> --json
```

Returns: `key`, `id`, `name`, `siteFriendlyUrl`, plus the full `raw` structure definition.

To write the structure to a local file:
```bash
ldev resource structure --site /<site> --structure <KEY> --out <path/to/KEY.json>
```

## Read a Journal Template

```bash
ldev resource template --site /<site> --template <KEY> --json
```

Returns: `templateKey`, `externalReferenceCode`, `name`, `templateScript`.

To write the FTL to a local file:
```bash
ldev resource template --site /<site> --template <KEY> --out <path/to/KEY.ftl>
```

## Read an ADT

```bash
# By key or name
ldev resource adt --site /<site> --adt <KEY> --json

# By display style (runtime value like ddmTemplate_19690804)
ldev resource adt --site /<site> --display-style <displayStyle> --json

# Filtered by widget type
ldev resource adt --site /<site> --adt <KEY> --widget-type <type> --json
```

To export the ADT script to a file:
```bash
ldev resource export-adt --site /<site> --adt <KEY> --widget-type <type>
```

## List All Fragments for a Site

```bash
ldev resource fragments --site /<site> --json
```

Returns collections and fragment entries with `fragmentKey`, `name`, `collectionName`.

## Export to Local File (Batch)

When you need to work with all resources of a type locally:

```bash
ldev resource export-structures --site /<site>          # all structures → local layout
ldev resource export-templates --site /<site>           # all templates
ldev resource export-adts --site /<site>                # all ADTs
ldev resource export-fragments --site /<site>           # all fragments
```

These are bulk operations. Prefer singular reads when working on one resource.

## Done When

The resource object is available with its `key` and the relevant content fields
(`raw` for structures, `templateScript` for templates, `script` for ADTs).

## Guardrails

- If the key is unknown, use `ldev-portal-inventory` first — never guess a key.
- Prefer singular reads (`resource structure`, `resource template`) over bulk exports when only one resource is needed.
- Use `--json` when the output will be parsed or compared.
- After any edit, read back with the same command to verify the live state matches the local file.
