# Validation

Checklist to decide whether the fix is actually done.

## Operational Definition of Done

1. The original symptom no longer reproduces on the exact local URL used for `Red`
2. The issue's explicit expected-behavior checklist is satisfied
3. No regressions appear in adjacent surfaces
4. If OSGi applies, the bundle is in the expected state
5. Recent logs do not show new errors caused by the change
6. There is enough evidence for human review

## Base Commands

```bash
ldev logs --since 2m --no-follow
```

Before any validation claim, confirm the edited surface was actually applied to
the runtime with the matching action:

- module or deployable Gradle unit changed -> `ldev deploy module <module-name>`
- theme assets or theme CSS/JS/templates changed -> `ldev deploy theme`
- structure changed -> `ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY>`
- ADT changed -> `ldev resource import-adt --site /<site> --file <path/to/adt.ftl>`
- template changed -> `ldev resource import-template --site /<site> --template <TEMPLATE_ID>`
- fragment changed -> `ldev resource import-fragment --site /<site> --fragment <fragment-key>`
- properties or source OSGi config changed -> `ldev env restart`

If that step did not happen, stay in `Red` even if the source files look correct.

If an OSGi module applies:

```bash
ldev osgi status <bundle> --json
ldev osgi diag <bundle> --json
```

If a portal resource applies:

```bash
ldev portal inventory page --url <localUrl> --json
ldev resource structure --site /<site> --structure <STRUCTURE_KEY>
ldev resource template --site /<site> --template <TEMPLATE_ID>
```

If the change affects visible output from a template, ADT, structure, or fragment,
visual validation is the recommended default. Import success alone is not
sufficient evidence for visual/user-facing changes. For trivial or non-visual
changes, the developer may choose a lighter validation path; record that decision
in the handoff.

When the chosen validation path uses a Red -> Green screenshot loop,
`before.png` should already exist from the reproduction step in intake. Do not
re-capture it here; that would overwrite the baseline taken before the fix.

```bash
# before.png already captured during intake/reproduction
# After applying the fix and importing:
playwright-cli -s=issue-NUM snapshot
playwright-cli -s=issue-NUM run-code "async function (page) { await page.screenshot({ path: '.tmp/issue-NUM/after.png', fullPage: true }); }"
```

## Red -> Green Checklist

Turn the issue description into explicit assertions before declaring success.

For example:

- calendar/sidebar still visible in the expected position
- "today" / "current week" buttons still visible
- results column width stays stable
- empty-state message is visible in the results area

For bug fixes and visual changes, do not mark the issue as fixed until each
expected behavior is checked on the final local page state. For explicitly scoped
trivial work, record the lighter validation chosen by the developer.

If browser routing is wrong for the target virtual host, do not count an unrelated
screenshot as evidence. Record visual validation as blocked and use:

```bash
# bash/zsh
curl -I "<localUrl>"
ldev logs --since 2m --no-follow
```

```powershell
# PowerShell: use curl.exe to avoid the Invoke-WebRequest alias
curl.exe -I "<localUrl>"
ldev logs --since 2m --no-follow
```

If the after screenshot still shows any reported symptom, stay in `Red`. Do not
handoff, do not claim success, and do not ask for commit/PR preparation yet.
