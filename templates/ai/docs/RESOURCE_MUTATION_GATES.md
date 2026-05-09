# Resource Mutation Gates

Before mutating structures, templates, ADTs, or fragments:

```bash
ldev resource import-structure --site /<site> --structure <KEY> --check-only
ldev resource import-template --site /<site> --template <KEY> --check-only
ldev resource import-adt --site /<site> --file <path> --check-only
```

`import-fragment` has no `--check-only`; validate fragment source files
manually before importing.

Apply the smallest matching import and then prove Green with read-after-write,
fresh logs, and browser evidence when behavior is visible. Import success alone
is not Green; the real import plus read-back proves the new script hash.