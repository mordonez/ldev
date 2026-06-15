# AI Assets for `ldev`

Standard AI knowledge base for projects that use `ldev`.

This package is intentionally split into three areas:

- `install/`: assets that `ldev ai install` copies into a project by default.
- `project/`: project-owned templates and optional project overlays.
- `skills/`: reusable domain skills that are safe to inherit across Liferay projects.
- `docs/`: product rules, inventory and maintainer guidance.

Design intent:

- vendor skills are the canonical home for reusable `ldev` operational knowledge
- project overlays are for repository-specific process and context only

## Installation (real examples)

Use `ldev` as the canonical entrypoint (Option A).

Install base AI meta-files in a project:

```bash
ldev ai install --target .
```

Overwrite existing files:

```bash
ldev ai install --target . --force
```

Install skills via the skills.sh standard:

```bash
npx skills add https://github.com/mordonez/ldev
```

## Prompt usage examples (tsdown-style, adapted to `ldev`)

After install, skills live under `.agents/skills/` and can be invoked from prompts.

Router style:

```text
Use the liferay-expert skill to route this task:
"I need to export a structure and review dependencies before importing into another environment."
```

Implementation style:

```text
Use developing-liferay:
"Create a plan to implement a fragment + ADT template with verifiable steps and ldev commands."
```

Operations style:

```text
Use deploying-liferay:
"Build and deploy the changed-only module, validate OSGi state, and propose rollback steps if deployment fails."
```

Troubleshooting style:

```text
Use troubleshooting-liferay:
"Portal is down; provide a layered diagnosis using ldev doctor/context and recommended next actions."
```

Browser automation style:

```text
Use automating-browser-tests:
"Navigate to the page editor, validate rendering, and leave visual evidence of the changes."
```

## Maintenance tips

- Install vendor skills via `npx skills add https://github.com/mordonez/ldev` (skills.sh standard).
- Keep project-owned know-how in:
  - `CLAUDE.md`
  - `docs/ai/project-context.md`
  - `.agents/skills/project-*`
