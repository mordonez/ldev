# Runtime Resource Handoff Template

Use this template when the final handoff includes production promotion for a
runtime-backed resource.

````md
## Production Promotion

These changes affect runtime-backed resources. Do not deploy a theme or module
to apply them.

### Preferred path (`ldev`)

1. Run the atomic import commands for the affected resource(s):

```bash
# Example: templates
ldev resource import-template --site /<site> --template <TEMPLATE_KEY> --json
```

2. Run the normal runtime verification commands:

```bash
ldev portal check --json
ldev logs diagnose --since 5m --json
```

### Manual UI fallback

If production cannot run `ldev` directly, apply the same runtime resource in the
Liferay UI:

1. Open the resolved site scope: `/<site>`.
2. Open the owning UI for the affected resource type.
3. Find the existing resource by its exact identifier:
   - template: `<TEMPLATE_KEY>`
   - ADT: `<ADT_KEY>` or `<DISPLAY_STYLE>`
   - structure: `<STRUCTURE_KEY>`
   - fragment: `<FRAGMENT_KEY>`
4. Replace or import the reviewed content from the repository.
5. Save or publish the resource.

### Resource-specific note

- template: Web Content -> Templates
- structure: Web Content -> Structures
- fragment: Fragments
- ADT: the owning display-template UI for the affected widget or content type

### Visual verification

- verify the affected production URL
- confirm the expected runtime behavior changed
- confirm no adjacent regressions are visible
````