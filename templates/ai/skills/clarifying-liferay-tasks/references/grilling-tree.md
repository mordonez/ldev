# Grilling Trees

Pick the tree that matches the request shape. Walk it top-down, one question at
a time, each with a recommended answer. Skip a node when `ldev` discovery
already answers it.

## 1. Resource change (Article, Structure, Template, ADT, Fragment)

1. Which Site does this affect? *(recommended: resolve from
   `ldev portal inventory sites --json`; ask only if multiple sites match)*
2. Is the change to a **rendered output** (Template / ADT / Fragment) or to the
   **data shape** (Structure)? *(recommended: rendered output — a Structure
   change implies migration risk; route to `migrating-journal-structures`)*
3. If rendered output: is it a **Journal Template** (per Article) or an **ADT**
   (per Widget) or a **Fragment** (per Page)? *(recommended: resolve from
   `ldev portal inventory page --url ... --json --full`)*
4. Will existing content keep working unchanged after the edit? *(recommended:
   yes — if no, escalate to `migrating-journal-structures`)*
5. Is this user-visible? *(recommended: yes — plan a Playwright Red→Green check)*

Stop when steps 1–4 are answered. Route to `developing-liferay`.

## 2. Code change (Module, Theme, Service Builder, Object handler)

1. Which **module** or **theme** owns the affected behaviour? *(recommended:
   resolve by file path → `bnd.bnd` symbolic name; ask only if the code path
   does not point to a single module)*
2. Is the change a **bug fix**, a **new feature**, or a **refactor**?
   *(recommended: bug fix — keep diff small)*
3. Does the change touch a **public OSGi service** consumed by other modules?
   *(recommended: no — if yes, list every consumer module before editing)*
4. Will the bundle need a **service.xml** rebuild or DB migration?
   *(recommended: no — if yes, escalate scope to a Service Builder change)*
5. Will this require a **portal restart** (config files, portal-ext, factory
   PIDs)? *(recommended: no — if yes, plan the restart explicitly)*

Stop when steps 1–4 are answered. Route to `developing-liferay`.

## 3. Browser-visible change (page editor, layout, CSS)

1. Which **Page URL** is affected? *(recommended: resolve from the request and
   confirm with `ldev portal inventory page --url ... --json`)*
2. Is the affected element a **Fragment**, **Widget**, **Theme component**, or
   **Display Page Template**? *(recommended: from the page inventory output)*
3. Does the change need to be **visible in production** unchanged after deploy?
   *(recommended: yes — record both `ldev resource ...` and the manual UI
   fallback in the brief)*
4. Is there a **localized version** that must be checked too? *(recommended:
   yes if `availableLocales` shows more than one locale on this page)*

Stop when steps 1–3 are answered. Route to `developing-liferay` (for source
edits) or `automating-browser-tests` (for verification only).

## 4. Migration risk (Structure or Object schema)

1. Does **existing content** use the field you are about to change?
   *(recommended: assume yes by default. Real impact is only knowable from
   `ldev resource migration-pipeline --migration-file <file> --check-only
   --migration-dry-run` once a descriptor exists; do not declare the change
   safe until then.)*
2. Are there **dependent Structures** or **embedded Fragments** that read this
   field? *(recommended: search exports; if any, list them in the descriptor's
   `dependentStructures`)*
3. Is **search reindex** required after the migration? *(recommended: yes if
   the field is searchable; verify with `ldev portal reindex status --json`)*
4. Will the migration **drop or rename** an existing field? *(recommended: no
   by default; if yes, plan `cleanupSource: true` explicitly in the descriptor
   and only execute it in a real run after `--check-only` and
   `--migration-dry-run` have been reviewed.)*

Stop when steps 1–4 are answered. Route to `migrating-journal-structures`,
inside an isolated worktree.

## 5. Runtime failure (logs, OSGi, portal unhealthy)

1. Is the **environment running**? *(recommended: confirm with `ldev status
   --json` first; if not, run `ldev start` before any other question)*
2. Does the failure reproduce **on a clean local run**? *(recommended: confirm
   with `ldev logs diagnose --json`; if not, escalate to production
   reproduction with `ldev db sync` inside a worktree)*
3. Is the failing surface a **bundle**, an **HTTP endpoint**, an **import**, a
   **page render**, or a **search query**? *(recommended: derive from
   `ldev logs diagnose --json` first)*
4. Have you established a **fast feedback loop** for the failure? *(recommended:
   yes — see `troubleshooting-liferay/references/diagnose-discipline.md`)*

Do not attempt a fix here. Route to `troubleshooting-liferay` once steps 1–3
are answered.

## Universal stop conditions

Stop the grilling session and route immediately when:

- the user contradicts an existing ADR — flag the contradiction first
- the user uses a term that conflicts with the project glossary — flag first
- two URLs in the request resolve to different Sites — escalate to
  `troubleshooting-liferay`
- the request implicitly asks for a destructive bulk operation
  (`import-structures`, broad deploy, mass reindex) — surface the risk and ask
  for explicit human approval
