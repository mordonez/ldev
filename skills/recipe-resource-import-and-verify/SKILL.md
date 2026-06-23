---
name: recipe-resource-import-and-verify
description: 'Imports a modified structure, template, ADT, or fragment into the local portal and verifies the result. Use when a local resource file has been edited and needs to be applied and proven in the running portal.'
---

# Recipe: Resource Import and Verify

> **Prerequisites:** [`ldev-shared`](../ldev-shared/SKILL.md), [`portal-resource-workflow`](../portal-resource-workflow/SKILL.md)

## When to Use

A local resource file (structure, template, ADT, or fragment) has been edited and needs to be applied to the running portal and proven correct. This recipe covers the import + verify half of the workflow. For the export + edit half, see `portal-resource-workflow`.

For structural changes that require data migration (field renames, type changes, cross-structure moves) use `migrating-journal-structures` instead.

## Steps

### 1. Confirm portal is reachable

```bash
ldev doctor --portal --json
```

If portal readiness is blocked, stop and switch to `troubleshooting-liferay`.

### 2. Dry-run import

Always validate before writing:

```bash
# Structure
ldev resource import-structure --site /<site> --structure <KEY> --check-only --json

# Template
ldev resource import-template --site /<site> --template <KEY> --check-only --json

# ADT
ldev resource import-adt --site /<site> --file <path> --widget-type <type> --check-only --json

# Fragment
ldev resource import-fragment --site /<site> --fragment <KEY> --check-only --json
```

If `--check-only` reports errors, resolve them in the local file before continuing.

### 3. Apply the import

```bash
# Structure (use a generous timeout for large structures)
ldev resource import-structure --liferay-timeout-seconds 300 --site /<site> --structure <KEY> --json

# Template
ldev resource import-template --liferay-timeout-seconds 300 --site /<site> --template <KEY> --json

# ADT
ldev resource import-adt --site /<site> --file <path> --widget-type <type> --json

# Fragment
ldev resource import-fragment --site /<site> --fragment <KEY> --json
```

### 4. Read-back verify

Import success alone is not proof. Read the resource back from the portal:

```bash
ldev resource structure --site /<site> --structure <KEY> --json
ldev resource template --site /<site> --template <KEY> --json
ldev resource adt --site /<site> --adt <KEY> --widget-type <type> --json
```

Compare the returned payload against the local file. If the portal state does not match the expected change, do not proceed.

### 5. Check for regressions

```bash
ldev portal check --json
ldev logs diagnose --since 5m --json
```

### 6. Browser validation

For visible behavior changes (template rendering, fragment display, ADT output), validate the affected page in the browser. For structure authoring changes, prove both existing-content visibility and a saved new-content scenario that exercises the new field shape.

## Done When

- Read-back matches the expected resource state.
- `ldev portal check` is green.
- No new ERRORs in logs since the import.
- Browser validation passes for visible behavior changes.

Do not claim done from import command output alone.
