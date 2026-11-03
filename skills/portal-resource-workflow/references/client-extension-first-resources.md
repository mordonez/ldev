# Client-extension-first resources

DXP 2026 projects keep the content model in batch client extensions and site
models in site initializers. Every one of these resources has the same gate
order: **`--check-only` → apply → read-back**. Import success alone is not
Green; the read-back is the proof. Do not fall back to raw Headless `curl`.

| Resource | Check | Apply | Read back |
| --- | --- | --- | --- |
| Picklist | `ldev resource import-picklist --picklist <ERC> --check-only` | `ldev resource import-picklist --picklist <ERC> [--create-missing]` | `ldev resource picklist --picklist <ERC> --json` |
| Object Definition | `ldev resource import-object --object <ERC> --check-only` | `ldev resource import-object --object <ERC> [--create-missing]` | `ldev resource object --object <ERC> --json` |
| Batch data file | `ldev portal batch import --file <file> --check-only` | `ldev portal batch import --file <file>` | built in (by ERC) |
| Client extension | `ldev deploy status` | `ldev deploy client-extension <name>` | built in (bundle + batch outcome) |
| Site initializer | `ldev resource apply-site-initializer --source <cx> --site-erc <ERC> --check-only` | same without `--check-only` | built in (pages, menus, DPTs) |
| Redirect map | `ldev resource import-redirects --site <site> --file <map> --check-only` | same without `--check-only`, plus `--probe` | `ldev portal inventory redirects --site <site>` |
| Style book | `ldev resource import-style-book --style-book <ERC> --check-only` | `ldev resource import-style-book --style-book <ERC>` | `ldev resource style-book --style-book <ERC>` |
| Fragments in /global | — | `ldev resource import-fragments --site /global` | `ldev resource fragments --site /global` |

Inventory before editing: `ldev portal inventory objects|picklists|vocabularies|spaces|client-extensions --json`.

## Order

1. Picklists, then the objects that reference them (`import-object` fails on a
   missing picklist or relationship target).
2. Batch client extensions and batch data.
3. Company-level design resources in `/global` (style books, fragments).
4. Site initializers, one site ERC at a time.
5. Redirect maps per site, last, with `--probe`.

## Stop and ask

- A `remove` in `--check-only` output (`objectFields[...]`,
  `listTypeEntries[...]`, `frontendTokensValues.*`) deletes data. Get explicit
  user approval before `--allow-breaking-change`.
- `apply-site-initializer --recreate` deletes the site and all its content.
  Site initializers are create-only; there is no re-apply.
- `LIFERAY_BATCH_FAILED` lists items already written: batch imports are not
  transactional.
- A batch client extension bundle stays `Active` even when its import failed;
  trust `ldev deploy client-extension` / `ldev logs diagnose`
  (`clientExtensionFailures`), not the bundle state.

## OAuth scopes

`ldev oauth install --scope-profile objects --scope-profile batch --scope-profile content-model`
covers objects, picklists, batch, vocabularies and spaces. Entries of a custom
object (`/o/c/...`) need that object's own scope.
