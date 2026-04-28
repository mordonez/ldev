# FTL / Resource Brief Template

Specialised brief for changes that target a Journal Template, ADT, or
Fragment FTL. Extends [agent-brief-template.md](agent-brief-template.md).

## Template

```markdown
## Agent Brief

**Category:** bug / enhancement
**Summary:** one-line description in glossary terms

**Liferay surface:**
- Site: /<site>
- Resource type: <Journal Template | ADT | Fragment>
- Resource key:
  - Structure key (when applicable): <STRUCTURE_KEY>
  - Template id or key: <TEMPLATE_ID>
  - ADT key (when applicable): <ADT_KEY>
  - Widget type (for ADTs): <widget-type>
  - Fragment key (when applicable): <FRAGMENT_KEY>
- Locales affected: <list, or "default only">

**Verification source (durable):**
- `ldev portal inventory templates --site /<site> --json`
- `ldev resource template --site /<site> --template <TEMPLATE_ID> --json`
- For ADTs: `ldev resource adt --display-style ddmTemplate_<ID> --site /<site> --json`
- For Fragments: `ldev resource fragments --site /<site> --json`

**Current behavior:**
What the FTL renders today. Be specific about visible output, locale, and any
empty / error state.

**Desired behavior:**
What the FTL must render after the change. Cover edge cases (empty list,
missing field, locale fallback).

**Key interfaces (durable):**
- FTL variables you depend on: `entries`, `themeDisplay.locale`,
  `reserved-article-title`, `getterUtil`, etc.
- Structure field shapes consumed (referenced by **field name**, not by id)
- Any helper macros from the project's macro library

**Acceptance criteria:**
- [ ] `ldev resource import-<type> --check-only` returns clean diff
- [ ] After the real import, `ldev resource template --site /<site> --template
      <TEMPLATE_ID> --json` shows the new source
- [ ] Affected URL renders the desired output in Playwright (Red → Green)
- [ ] `ldev logs diagnose --since 5m --json` shows no new FTL errors
- [ ] If localized: every locale in `availableLocales` renders correctly

**Out of scope:**
- Changing the underlying Structure (would imply migration risk)
- Changing the page where the resource is embedded
- Touching unrelated Templates / ADTs / Fragments

**Production handoff:**
- Preferred: `ldev resource import-<type> --site /<site> --... ` with the
  matching key and `--check-only` first
- Manual UI fallback: Site Menu → Design → <Templates / Application Display Templates / Page Fragments>
```

## Notes

- Use the project glossary for the `Site` value, not raw friendly URLs from
  inventory output.
- If the change affects a Structure as well, escalate to
  `migrating-journal-structures` and use that skill's descriptor instead of
  this brief.
- For Fragments: `import-fragment` has no `--check-only`. Validate the source
  files manually before running the import.
