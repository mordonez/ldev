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

## Shared Resource Ownership

Document stable facts about shared Journal structures, templates, ADTs, and
fragments here. If a shared site is the canonical source of truth, say so
explicitly and list known copied folders that are not edited directly.

Example:

- `/global` owns shared Journal resources for public pages.
- `marketing-copy` and `regional-copy` contain copied resources and are not edited
  directly unless runtime inventory proves a page uses those copies.

Agents should not edit copied resources unless this section or fresh runtime
inventory proves the copy is the active source for the issue.
Operational shorthand: do not edit copied resources without proof.

## Project Runbooks

List only what cannot live in a reusable vendor skill:

- [TODO] site-building workflow
- [TODO] fragment import workflow
- [TODO] CI/deploy caveats
- [TODO] localized admin menu maps under docs/ai/menu/
- [TODO] menu map entrypoint path for agents (for example: docs/ai/menu/navigation.i18n.json)
