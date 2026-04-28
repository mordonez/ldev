# CSS Brief Template

Specialised brief for browser-visible visual changes (theme CSS, Fragment CSS,
Client Extension CSS). Extends
[agent-brief-template.md](agent-brief-template.md).

## Template

```markdown
## Agent Brief

**Category:** bug / enhancement
**Summary:** one-line description in glossary terms

**Liferay surface:**
- Affected URL: <fullUrl on local runtime>
- Owning surface: <Theme | Fragment | Client Extension CSS | Display Page Template>
- Theme name (when applicable): <theme module name or BSN>
- Fragment key (when applicable): <FRAGMENT_KEY>
- Client Extension type (when applicable): <css>
- Locales affected: <list, or "default only">
- Viewports to verify: <desktop / tablet / mobile>

**Verification source (durable):**
- `ldev portal inventory page --url <fullUrl> --json --full`
- For themes: `ldev deploy theme`
- For Fragments: `ldev resource import-fragment --site /<site> --fragment <FRAGMENT_KEY>`
- Playwright session against the affected URL

**Current behavior:**
What is visually wrong today. Capture a `before-fullpage.png` under
`.tmp/issue-<num>/` and reference it. Describe the symptom in user-facing
terms: spacing, alignment, color, breakpoint behaviour.

**Desired behavior:**
What the page must look like after the change. Capture an annotated mock or
describe the rule precisely (spacing values, color tokens, breakpoint at which
the rule must apply).

**Key interfaces (durable):**
- Selectors targeted (annotate by **role** or stable class, not by transient
  Liferay-generated `_INSTANCE_xxx` classes)
- Design tokens / CSS custom properties consumed (Clay tokens preferred over
  raw values when the project uses them)
- Breakpoints and media query expressions

**Acceptance criteria:**
- [ ] `before-fullpage.png` matches the original symptom
- [ ] `after-fullpage.png` matches the desired behaviour
- [ ] Adjacent components on the same page render unchanged (regression check)
- [ ] All listed viewports render correctly
- [ ] All locales in `availableLocales` render correctly
- [ ] `ldev deploy theme` (or `ldev resource import-fragment ...`) completed
      with no error
- [ ] `ldev logs diagnose --since 5m --json` is clean

**Out of scope:**
- Changing the markup or template (would belong in an FTL brief)
- Refactoring unrelated styles in the same file
- Adding new design tokens unless the change explicitly requires it

**Production handoff:**
- Theme: built artifact deployed via project pipeline
- Fragment: `ldev resource import-fragment --site /<site> --fragment <key>`
  with manual UI fallback at Site Menu → Design → Page Fragments
- Client Extension CSS: deployed as part of the Client Extension build
```

## Notes

- Annotate selectors by stable role/class. Liferay generates `_INSTANCE_xxx`
  suffixes that drift between deploys.
- If the change touches a Theme, prefer `_custom.scss` or the theme's documented
  override seam over editing classpath files.
- For Client Extension CSS, prefer it over a Theme override when the rule is
  scoped to a specific Page or Fragment.
- Always capture both `before` and `after` full-page screenshots under
  `.tmp/issue-<num>/`. CLI output alone is not evidence for a visual change.
