# Fragments Reference

Use this reference for versioned fragments and controlled fragment imports.

## Source of truth

- Fragments project under `liferay/ub-fragments/` or the repo's configured fragments path

Do not create parallel fragment sources outside the versioned project layout.

## Recommended flow

1. Discover the affected site or page:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev resource fragments --site /<site> --json
```

2. Export from portal if needed:

```bash
ldev resource export-fragment --site /<site> --fragment <fragment-key>
```

3. Edit the smallest fragment change

4. Import narrowly:

```bash
ldev resource import-fragment --site /<site> --fragment <fragment-key>
```

Or batch import only when really necessary:

```bash
ldev resource import-fragments --site /<site>
```

## Validation

```bash
ldev logs --since 2m --service liferay --no-follow
```

Verify in runtime or Page Editor as appropriate.

## Guardrails

- Do not reorder fragment metadata arbitrarily
- Do not use bulk import if a targeted import is enough
