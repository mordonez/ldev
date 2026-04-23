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

Use bootstrap first so an agent has the same project facts and readiness picture a developer would use.

```bash
ldev ai bootstrap --intent=develop --json
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
- optional project menu-map scaffolding under `docs/ai/menu/`
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
ldev portal inventory structures --site /global --with-templates --json
```

For structure/template incidents, prefer `inventory structures --with-templates`
as the first discovery step. It returns the structure list enriched with
associated templates in one call, so agents can route directly to the correct
export/import commands.

## Keeping rules and skills up to date

After pulling a new version of `ldev`, refresh skills and rules in the project:

```bash
ldev ai install --skills-only --target .
```

This updates `.agents/skills/` and all tool-specific rule directories
(`.claude/rules/`, `.cursor/rules/`, `.gemini/`, etc.).

> **Windows:** rule directories are created as copies instead of symlinks
> (symlinks require Developer Mode). Re-running the command above refreshes
> those copies. If you later enable Developer Mode, the next run replaces the
> copies with proper symlinks automatically.

## Runtime Contract

The full execution contract lives in `AGENTS.md` (installed by `ldev ai install`). The
canonical Safety Invariants section of that file applies to every task regardless of skill.

Summary of the six phases a well-behaved agent follows:

| Phase                | When                         | Commands                                                                                                                                                                                                          |
| -------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-flight           | Always, before any task      | `ldev ai bootstrap --intent=discover --json` or `ldev ai bootstrap --intent=develop --json`                                                                                                                       |
| Health check         | Task touches runtime         | `ldev ai bootstrap --intent=deploy --json`, `ldev doctor --json`, `ldev status --json`                                                                                                                            |
| Discovery            | Task mentions portal surface | `ldev portal inventory ...`                                                                                                                                                                                       |
| Pre-mutation check   | Before any resource change   | `ldev resource import-* --check-only`                                                                                                                                                                             |
| Mutation             | After check-only passes      | `ldev resource import-*`, `ldev deploy ...`                                                                                                                                                                       |
| Post-mutation verify | After any mutation           | Resource changes: read back via `ldev resource get-*` / `ldev resource export-*` / `ldev portal inventory ... --json`; runtime/deploy changes: `ldev logs diagnose --since 5m --json`, `ldev portal check --json` |

Key invariants (full list in `AGENTS.md → Safety Invariants`):

- Always read `liferay.portalUrl` from context — never assume.
- Always consume `--json`. Never parse human-readable output.
- Always run `--check-only` before resource mutations.
- Never use plural resource commands without explicit human approval.
- Do not treat `ldev logs diagnose` as universal verification for resource imports; prefer read-after-write evidence from `ldev resource` / `ldev portal inventory`.
- Diagnose before retrying a failed command.

## Execution, not hype

Use agents for planning or analysis if you want, but keep the system boundary clear:

- `ldev` discovers state
- `ldev` executes local operational steps
- `ldev` returns structured output for verification

That is enough to support reliable agent workflows without inventing a separate platform story.
