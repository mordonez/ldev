# Project Context

Long-form, project-owned context for AI agents working in this repository.

Start from [project-context.md.sample](project-context.md.sample), then replace
all example values with the real values for this project.

Keep this file factual, specific and maintainable. If something becomes
reusable across multiple projects, move it into a vendor skill instead.

## Stack

| Component | Version / detail |
|---|---|
| Liferay DXP | [TODO] |
| Java | [TODO] |
| Gradle | [TODO] |
| Node.js | [TODO] |
| PostgreSQL | [TODO] |
| Elasticsearch | [TODO] |
| Theme | [TODO] |
| CI/CD | [TODO] |

## Local Runtime

```bash
ldev ai bootstrap --intent=develop --cache=60 --json
ldev --repo-root ../main-checkout ai bootstrap --intent=develop --cache=60 --json
ldev setup
ldev start
ldev status
ldev logs --since 5m --no-follow
ldev stop
```

Use the global `--repo-root` form when an agent is inside a worktree but needs
read-only discovery or bootstrap context from the main checkout.

## Project Layout

- Liferay workspace root: `[TODO]`
- Modules: `[TODO]`
- Theme: `[TODO]`
- Fragments: `[TODO]`
- Journal resources: `[TODO]`
- Config: `[TODO]`

## Conventions

- Base package: `[TODO]`
- Branch convention: `[TODO]`
- PR convention: `[TODO]`

## Glossary

Project-specific terms with their canonical Liferay mapping. Vendor skills
consume this section via `liferay-expert/references/domain-awareness.md`. See
[project-context.md.sample](project-context.md.sample) for the full format.

```md
**[Project Term]**:
[One-sentence definition.]
_Avoid_: [synonyms agents must not drift to]
_Liferay mapping_: [Site / Page / Structure key / Template id / Module / Object]
```

- [TODO] add the 5–10 terms a fresh agent must know to talk about this project
- [TODO] flag ambiguities resolved during onboarding so they are not re-litigated

## Project Runbooks

List only what cannot live in a reusable vendor skill:

- [TODO] site-building workflow
- [TODO] fragment import workflow
- [TODO] CI/deploy caveats
- [TODO] localized admin menu maps under docs/ai/menu/
- [TODO] menu map entrypoint path for agents (for example: docs/ai/menu/navigation.i18n.json)
