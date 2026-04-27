# Repository-Backed Resource Workflow

Use this reference when structures, templates, ADTs, or fragments should be
reviewed as files in Git instead of edited ad hoc through the UI.

## 1. Discover exact identifiers

```bash
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
ldev resource fragments --site /<site> --json
```

## 2. Export current portal state

Use focused exports when changing one object:

```bash
ldev resource export-structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource export-template --site /<site> --template <TEMPLATE_ID>
ldev resource export-adt --site /<site> --adt <ADT_KEY> --widget-type <widget-type>
ldev resource export-fragment --site /<site> --fragment <FRAGMENT_KEY>
```

If you intentionally need several resources, repeat the singular export command
per resource. Do not use plural export commands unless a human explicitly asked
for a bulk refresh and accepted the larger diff.

## 3. Edit locally

Review the exported resource files like any other source change.

## 4. Validate before mutating

```bash
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --template <TEMPLATE_ID> --check-only
ldev resource import-adt --site /<site> --file <path/to/adt.ftl> --check-only
```

`--check-only` is drift detection, not a semantic validator. If you changed the
file, a hash mismatch is expected. Review the diff, then proceed to the real
import when the change is intentional.

## 5. Apply the smallest safe import

```bash
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource import-template --site /<site> --template <TEMPLATE_ID>
ldev resource import-adt --site /<site> --file <path/to/adt.ftl>
ldev resource import-fragment --site /<site> --fragment <fragment-key>
```

`import-fragment` has no `--check-only` flag. Validate the fragment source
manually before importing.

## Guardrails

- Do not deploy themes or modules to apply Journal templates, ADTs, fragments,
  or structures.
- Do not use plural export/import commands unless a human accepted the broader
  diff or mutation scope.
- Verify browser-visible changes after import; import success alone is not
  sufficient evidence.
- If you write production promotion notes for a runtime-backed resource,
  include the matching manual Liferay UI fallback from
  `runtime-resource-production-handoff.md`; do not assume remote `ldev` access.