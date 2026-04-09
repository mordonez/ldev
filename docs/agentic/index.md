---
title: Agent Workflows
description: Use ldev as the execution layer for agents and scripts without treating AI as the product.
---

# Agent Workflows

`ldev` helps agents because it exposes operational steps that are already useful for humans.

The tool is the execution layer. The value is still in Liferay maintenance work:

- inspect the environment
- diagnose the failure
- apply a fix locally
- verify the result

## Context snapshots

Use `context` first so an agent has the same runtime picture a developer would use.

```bash
ldev context --json
ldev status --json
ldev doctor --json
```

## Bootstrap the repo first

Install the managed AI assets into the project:

```bash
ldev ai install --target .
```

Optional overlays:

```bash
ldev ai install --target . --project-context
ldev ai install --target . --project --project-context
```

Useful follow-up:

```bash
ldev ai status --target . --json
```

What this prepares:

- `AGENTS.md`
- vendor-managed skills under `.agents/skills`
- optional project context scaffolding
- optional project-owned skills and agents

Real example:

```bash
ldev ai install --target . --project --project-context
```

```text
Project type: ldev-native
Installed skills: 6
AGENTS.md: installed
CLAUDE.md: installed
docs/ai/project-context.md: installed
Updated tool targets: .claude/rules, .cursor/rules, .gemini, .github/instructions, .windsurf/rules, .workspace-rules
Installed project skills: 2
Installed project agents: 4
```

In Blade workspaces, `ldev` can coexist with the official AI folders and `.workspace-rules` model instead of replacing it.

## Where knowledge lives

The AI layer is easier to maintain if each kind of knowledge has one clear home:

- `.agents/skills/*` without the `project-` prefix are vendor skills installed by `ldev`
- `.agents/skills/project-*` are project-owned workflows such as issue handling or PR process
- `docs/ai/project-context.md` is the long-form project context document
- `.workspace-rules/ldev-*` are runtime/tooling rules for `ldev`, not the main home of project process

In short:

- use skills for workflows
- use `project-context.md` for project context
- use `ldev-*` workspace rules for runtime and tooling guidance

This keeps the same model working in both `ldev-native` and `blade-workspace`
without duplicating project process across multiple folders.

## Structured portal discovery

Agents can inspect the portal without screen scraping or UI navigation:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
```

## Execution, not hype

Use agents for planning or analysis if you want, but keep the system boundary clear:

- `ldev` discovers state
- `ldev` executes local operational steps
- `ldev` returns structured output for verification

That is enough to support reliable agent workflows without inventing a separate platform story.
