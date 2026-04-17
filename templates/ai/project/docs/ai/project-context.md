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
ldev doctor
ldev setup
ldev start
ldev status
ldev logs --since 5m --no-follow
ldev stop
```

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

## Project Runbooks

List only what cannot live in a reusable vendor skill:

- [TODO] site-building workflow
- [TODO] fragment import workflow
- [TODO] CI/deploy caveats
- [TODO] localized admin menu maps under docs/ai/menu/
- [TODO] menu map entrypoint path for agents (for example: docs/ai/menu/navigation.i18n.json)
