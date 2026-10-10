# Fragments Reference

Use this reference for versioned fragments and controlled fragment imports.

## Source of truth

- Fragments project: read `context.paths.resources.fragments` from `ldev context --json`. Commonly under `liferay/fragments/` or a project-specific path like `liferay/ub-fragments/`.
- Do not create parallel fragment sources outside the versioned project layout.
- Do not guess the fragments path from the file system. Always read it from `ldev context --json`.

## Recommended flow

1. Discover the affected site or page:

```bash
ldev portal inventory page --url <fullUrl> --full --json
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

If several fragments changed, repeat the singular import command per fragment.
Do not use plural fragment imports unless a human explicitly asks for a bulk
operation and accepts the risk.

If `import-fragment` reports a fragment read-back/hash mismatch, do not search
for a generated checksum file. `ldev` has already imported and then compared
the runtime read-back with local `html/css/js/configuration`. First verify the
active fragment source directory, fragment key, site, and any Liferay
normalization of those fields. Do not hunt through `.ldev`, editor
`workspaceStorage`, hidden files, or `fragment.json` for a hash, and do not look
for a force flag. If one untouched fragment imports cleanly, the CLI path is
working; export or read back the changed fragment and compare the normalized
runtime fields with the edited source.

## Validation

When fixing editable IDs, validate the exact attribute pattern, not every
FreeMarker assignment. Remaining `[#assign ...]` blocks are only relevant if
they still build `data-lfr-editable-id` or another edited runtime contract.

```bash
ldev logs --since 2m --service liferay --no-follow
```

Verify in runtime or Page Editor as appropriate.

## Guardrails

- Do not reorder fragment metadata arbitrarily
- Do not use bulk import if a targeted import is enough
