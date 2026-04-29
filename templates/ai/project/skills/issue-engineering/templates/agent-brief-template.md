# Agent Brief Template

Generic durable brief for any Liferay change handed to an AFK agent. Adapted
for project-issue-engineering. Specialised templates (`ftl-`, `java-module-`,
`css-`) extend this shape.

The brief is the contract. It must survive days in `ready-for-agent` state and
remain useful even after files are renamed, IDs change, or the implementation
is refactored.

## Principles

### Durability over precision

- **Do** describe behavioral contracts, observable outcomes, and Liferay
  surfaces (Site, Page, Structure key, Template id, Bundle symbolic name,
  Fragment key, Object name).
- **Don't** reference file paths or line numbers — they go stale.
- **Don't** assume the current code structure will remain unchanged.
- **Don't** quote IDs that are local-only (PLIDs, group IDs, randomly
  generated DDM template ids without a stable key) — quote the **key** instead.

### Behavioral, not procedural

- **Good:** "On the Campaign Article display page, the lead form must validate
  email format before submit."
- **Bad:** "Open `lead-form.ftl` line 42 and add a regex check."

### Complete acceptance criteria

Each criterion must be independently verifiable by `ldev` discovery, runtime
verification, or browser evidence.

### Explicit scope boundaries

State what is **out of scope** to prevent gold-plating.

## Template

```markdown
## Agent Brief

**Category:** bug / enhancement / migration
**Summary:** one-line description in glossary terms

**Liferay surface:**
- Site: /<site>
- Affected page or resource: <friendly URL | Structure key | Template id key | ADT key | Fragment key | Module symbolic name | Object name>
- Owning surface: <ADT | Journal Template | Display Page Template | Fragment | Module | Theme | Object | Web Content Article>
- Locales affected: <list, or "default only">

**Current behavior:**
What happens now. For bugs, the broken behaviour. For enhancements, the status
quo the change builds on. Use glossary terms.

**Desired behavior:**
What must happen after the change. Be specific about edge cases, error states,
and empty states. Use glossary terms.

**Key interfaces (durable):**
- <Type / Service / Configuration / Structure field / FTL variable> — what
  changes and why
- <Bundle symbolic name | Object definition name> — what is added, removed,
  or modified
- <Configuration PID> — any new or changed `.config` keys

**Acceptance criteria:**
- [ ] Specific testable criterion 1, verifiable through `ldev portal inventory
      ...` or `ldev resource ...` or runtime evidence
- [ ] Specific testable criterion 2, verifiable through Playwright Red→Green
- [ ] Specific testable criterion 3
- [ ] `ldev logs diagnose --since 5m --json` is clean after the change
- [ ] If the change affects a bundle: `ldev osgi status <bsn> --json` reports
      `ACTIVE`

**Out of scope:**
- <thing the agent must not change>
- <adjacent surface that may seem related but is separate>
- <broader refactor that may be tempting but is not part of this issue>

**Production handoff (runtime-backed resources only — Templates, ADTs, Fragments, Structures):**
- Preferred: `ldev resource import-<type> --site /<site> --... --check-only` then without `--check-only`
- Manual UI fallback: <Liferay UI path, e.g. Site Menu → Design → Templates>
- For modules and themes, replace this section with a **Deploy contract** that names the build artifact and CI/CD path; no UI fallback exists for compiled artifacts.
```

## Examples

### Good — fragment fix

```markdown
## Agent Brief

**Category:** bug
**Summary:** Hero banner Fragment shows broken locale link in Spanish

**Liferay surface:**
- Site: /partners
- Affected page or resource: Fragment key `hero-banner`
- Owning surface: Fragment
- Locales affected: es-ES, en-US

**Current behavior:**
On the Partner Portal home page, the Hero Banner Fragment renders an `href`
attribute that points to the English locale segment even when the page is
served in Spanish.

**Desired behavior:**
The Hero Banner Fragment must render an `href` whose locale segment matches
the current Page locale. Empty link configuration must render no anchor at all
instead of a `#` placeholder.

**Key interfaces (durable):**
- Fragment configuration `hero-banner.json` — locale-aware link field
- FTL variable `themeDisplay.locale` — used to resolve the locale segment

**Acceptance criteria:**
- [ ] Opening `/es/web/partners/home` in Playwright shows the Hero Banner with
      `href` containing `/es/`
- [ ] Opening `/en/web/partners/home` in Playwright shows the Hero Banner with
      `href` containing `/en/`
- [ ] Removing the link configuration causes the anchor to disappear, not to
      render `href="#"`
- [ ] `ldev logs diagnose --since 5m --json` does not show new FTL errors
- [ ] After `ldev resource import-fragment --site /partners --fragment
      hero-banner` the Fragment appears unchanged in the Page Editor preview

**Out of scope:**
- Changing the link styling or the Fragment markup beyond the `href` resolution
- Adding new locale support
- Touching other Fragments on the same page

**Production handoff:**
- Preferred: `ldev resource import-fragment --site /partners --fragment hero-banner`
- Manual UI fallback: Site Menu → Design → Page Fragments → `hero-banner` → Edit
```

### Bad — what to avoid

```markdown
## Agent Brief

**Summary:** Fix the banner

**What to do:**
Open `liferay/ub-fragments/hero-banner/index.html` line 14 and change the
href. Then deploy. The Spanish version is broken.

**Files to change:**
- liferay/ub-fragments/hero-banner/index.html (line 14)
- liferay/ub-fragments/hero-banner/fragment.json
```

This is bad because:

- No category
- No Liferay surface section (Site, Fragment key, locale list)
- References file paths and line numbers that drift on rename
- No glossary terms (says "the banner" instead of "Hero Banner Fragment")
- No verifiable acceptance criteria
- No scope boundary
- No production handoff
