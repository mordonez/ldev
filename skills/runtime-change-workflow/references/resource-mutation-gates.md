# Resource Mutation Gates

Before mutating structures, templates, ADTs, fragments, or Object Definitions:

```bash
ldev resource import-structure --site /<site> --structure <KEY> --check-only
ldev resource import-template --site /<site> --template <KEY> --check-only
ldev resource import-adt --site /<site> --file <path> --widget-type <type> --check-only
ldev resource import-picklist --picklist <ERC> --check-only
ldev resource import-object --object <ERC> --check-only
```

For objects and picklists, review `changes` in the check-only output. A `remove`
on `objectFields[...]` or `listTypeEntries[...]` deletes that field or entry and
orphans stored data: get explicit user approval before `--allow-breaking-change`.
Import picklists and relationship targets before the objects that use them; do
not create them with raw Headless calls.

`import-fragment` has no `--check-only`; validate fragment source files
manually before importing.

Apply the smallest matching import and then prove Green with read-after-write,
fresh logs, and browser evidence when behavior is visible. Import success alone
is not Green; the real import plus read-back proves the new script hash.
