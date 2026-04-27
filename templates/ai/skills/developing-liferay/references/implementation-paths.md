# Implementation Paths

Use this reference once the affected surface is already clear.

## Theme and frontend source

Use when the change is in SCSS, JS, theme templates, or other packaged theme
assets.

Reference: `theme.md`

```bash
ldev deploy theme
ldev logs --since 2m --service liferay --no-follow
```

## OSGi modules and Java

Use when the change lives in `modules/` or another deployable Gradle unit.

References:

- `osgi.md`
- `extending-liferay.md`

```bash
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
```

## Service Builder

Run only after a confirmed Service Builder change to `service.xml` or the
generated service layer. This is broader than a module deploy, so do not use it
as a generic fix-up step. If a single generated module can prove the change, use
`ldev deploy module <module-name>` instead.

## Liferay Objects

Use for custom data models on DXP 7.4+ that need their own headless REST API
without traditional OSGi modules.

References:

- `objects.md`
- `oauth2-setup.md`
- `headless-openapi.md`

## Journal structures, templates, and ADTs

Use the stable file-based resource workflows instead of ad hoc API calls.

References:

- `structures.md`
- `structure-field-catalog.md`
- `workflow.md`
- `groovy-console.md`

```bash
ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY> --check-only
ldev resource import-template --site /<site> --template <TEMPLATE_ID> --check-only
ldev resource import-adt --site /<site> --file <path/to/adt.ftl> --check-only
```

When validation looks correct, run the same command without `--check-only`.

## Fragments

Treat fragments as versioned source plus explicit import workflow.

Reference: `fragments.md`

```bash
ldev resource fragments --site /<site> --json
ldev resource import-fragment --site /<site> --fragment <fragment-key>
```

`import-fragment` has no `--check-only` flag. Validate the fragment source file
manually before importing.

If the project uses a separate fragment authoring flow outside `ldev`, follow
that project-owned workflow instead of inventing custom commands.