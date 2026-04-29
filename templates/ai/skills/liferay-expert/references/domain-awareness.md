# Domain Awareness

Consumer rules for any vendor skill that explores a Liferay project. Use these
before reading source code, browsing the portal, or proposing changes.

## Before exploring, read these

In this exact order. Stop at the first one that exists; the next one extends, it
does not replace.

1. `docs/ai/project-context.md` — long-form project facts and **Glossary**.
2. `docs/ai/project-learnings.md` — non-obvious traps captured from past sessions.
3. `docs/adr/` — architectural decisions the project has already made.
4. `.workspace-rules/*.md` (blade-workspace) or any `.agents/skills/project-*` skills.

If none of these files exist, **proceed silently**. Do not flag their absence
upfront. Do not invent content. The right moment to create them is when a real
term, decision, or learning gets resolved during the task.

## Use the project glossary

When the project's `docs/ai/project-context.md` defines a **Glossary** section,
use those terms verbatim in:

- file names, folder names, and module symbolic names you propose
- structure keys, template ids, ADT keys, fragment keys
- issue titles, brief sections, commit messages
- Playwright session names and evidence file names under `.tmp/`

Do not drift into synonyms the glossary explicitly avoids. If a Liferay-native
concept clashes with a project term (for example, the project calls a Site a
"portal" or a Web Content Article a "page"), surface the conflict instead of
silently picking one.

## Keep Liferay terms exact

When the project's glossary names a Liferay surface with a project-specific
synonym, write **both** in any brief, report, or PR title — the canonical
Liferay term first, the project term in parentheses. Vendor skills must always
recognise the canonical names below; do not silently substitute one for the
other.

| Canonical Liferay term | Frequently confused with |
| --- | --- |
| Site | Group, "portal", tenant, instance |
| Page | Layout, "screen", "view" |
| Web Content Article | Journal Article, "post", "entry", "content" |
| Journal Structure | DDM Structure, "schema", "model" |
| Journal Template | DDM Template, "renderer", "view" |
| Application Display Template (ADT) | "widget renderer", "list template" |
| Fragment | "block", "section" |
| Object | "custom entity", "table" (Objects are not raw DB tables) |
| Module / Bundle | "service", "plugin", "app" |
| Vocabulary / Category | "tag", "label" (Tags are a different concept) |

## Flag conflicts before acting

Surface these explicitly before changing anything:

- The project glossary defines a term that contradicts how the user just used it.
- An ADR forbids the architectural shape you were about to propose.
- A `docs/ai/project-learnings.md` entry warns against the path you were about
  to take.

Format:

> _Flag: glossary defines `X` as `Foo`, but the request implies `Bar`. Which is
> it?_

> _Flag: contradicts ADR-0007 ("event-sourced articles") — worth reopening
> because…_

This costs little and prevents wasted edits.

## Producer rule

If during the task a domain term gets resolved (the user clarifies what
"campaign" means in this project, or a vague label gets sharpened), update the
**Glossary** section of `docs/ai/project-context.md` inline at that moment. Do
not batch the update for later. Use this format:

```md
**[Project Term]**:
[One-sentence definition.]
_Avoid_: [synonyms agents must not drift to]
_Liferay mapping_: [Site / Page / Structure key / Template id / Module / Object]
```

If `docs/ai/project-context.md` does not exist, create it and seed the Glossary
section with the term you just resolved. Keep definitions tight (one sentence)
and always include the `_Liferay mapping_` line so the term anchors to a
concrete portal surface.
