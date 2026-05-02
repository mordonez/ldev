---
title: Agents and MCP
description: Why ldev is the missing execution layer for AI agents on Liferay, and how the bootstrap, skills and MCP server fit together.
---

# Agents and MCP

`ldev` is what gives an AI agent an execution layer on Liferay.

That sounds like a marketing line, but it is a technical statement. Most
critical Liferay operations — importing structures, exporting templates,
migrating articles, bootstrapping environments — only exist in the admin UI
or in uneven APIs. An agent cannot click. Liferay's own MCP surface is still
limited. So without a CLI like this, an agent connected to a Liferay system
can mostly observe, not operate.

`ldev` is the same CLI a developer uses, plus the wiring (bootstrap files,
managed skills, MCP tools) that lets an agent call the same workflows from
inside an editor.

## What `ldev` provides for agents

| Layer | What it does | Required? |
| --- | --- | --- |
| CLI with structured output | Canonical execution contract. Every workflow returns JSON. | Yes — the source of truth |
| `ldev ai install` | Installs `AGENTS.md`, vendor skills, and tool-specific rule directories (`.claude/rules`, `.cursor/rules`, `.gemini`, `.github/instructions`, `.windsurf/rules`, `.workspace-rules`). | Yes |
| `ldev-mcp-server` (15 tools) | Structured shortcuts over selected `ldev` workflows. | Optional, recommended |
| `ldev ai bootstrap --intent=...` | Aggregates project context + intent-specific doctor checks for the agent's first turn. | Recommended |

## Bootstrap the repo

```bash
ldev ai install --target .
```

What this prepares:

- `AGENTS.md`
- vendor-managed skills under `.agents/skills/`
- tool-specific rule directories
- optional project-owned skills, agents and context scaffolding

Optional overlays:

```bash
ldev ai install --target . --project-context
ldev ai install --target . --project --project-context
```

Useful follow-up:

```bash
ldev ai status --target . --json
```

In Blade workspaces, `ldev` coexists with the official AI folders and the
`.workspace-rules` model rather than replacing them.

## Set up the local MCP server

```bash
ldev ai mcp-setup --target . --tool all
```

This writes the MCP config for VSCode, Claude Code and Cursor in one run.

Use an explicit launch strategy when reproducibility matters:

```bash
ldev ai mcp-setup --target . --tool vscode --strategy local
ldev ai mcp-setup --target . --tool claude-code --strategy global
ldev ai mcp-setup --target . --tool cursor --strategy npx
```

If the editor does not show the tools:

```bash
ldev mcp doctor --target . --tool all
```

## Context snapshots

Use `ai bootstrap` so an agent has the same project facts and readiness
picture a developer would use.

```bash
ldev ai bootstrap --intent=discover --json
ldev ai bootstrap --intent=develop --json
ldev ai bootstrap --intent=deploy --json
ldev ai bootstrap --intent=troubleshoot --json
ldev ai bootstrap --intent=migrate-resources --json
ldev ai bootstrap --intent=osgi-debug --json
```

Use `--cache <seconds>` to reuse the result for the same intent and working
tree.

## Where knowledge lives

The AI layer is easier to maintain if each kind of knowledge has one home:

- `.agents/skills/*` (without the `project-` prefix) — vendor skills
  installed by `ldev`
- `.agents/skills/project-*` — project-owned workflows (issue handling,
  PR process)
- `docs/ai/project-context.md` — long-form project context
- `.workspace-rules/ldev-*` — runtime/tooling rules for `ldev`, not the
  main home of project process

Short version: skills for workflows, `project-context.md` for project
context, `ldev-*` workspace rules for tooling guidance. Same model in
`ldev-native` and `blade-workspace`.

## Structured portal context for agents

Agents consume the same inventory commands developers do — every call
returns consolidated context that would otherwise need several Headless API
calls:

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
ldev portal inventory structures --site /global --with-templates --json
```

For structure/template work, `inventory structures --with-templates` is the
right first call.

## Decision route

The agent layer follows this rule:

```
Skills decide what should happen.
MCP tools execute structured discovery and diagnosis when available.
CLI remains the source of truth and fallback for every workflow.
```

See [MCP Decision Route](./mcp-decision-route.md) for the maintained
mapping of MCP tools to CLI fallbacks, and
[MCP Server Inventory](./mcp-server-inventory.md) for the current and
candidate tool list.

## Keep skills and rules up to date

After pulling a new version of `ldev`, refresh skills and rules:

```bash
ldev ai install --skills-only --target .
```

This updates `.agents/skills/` and all tool-specific rule directories.

> **Windows:** rule directories are created as copies instead of symlinks
> (symlinks require Developer Mode). Re-running the command refreshes those
> copies. If you later enable Developer Mode, the next run replaces them
> with proper symlinks.

## The agent runtime contract

A well-behaved agent follows six phases. Full text in `AGENTS.md` after
install.

| Phase | When | Commands |
| --- | --- | --- |
| Pre-flight | Always | `ldev ai bootstrap --intent=discover --json` or `--intent=develop --json` |
| Health check | Task touches runtime | `ldev ai bootstrap --intent=deploy --json`, `ldev doctor --json`, `ldev status --json` |
| Discovery | Task mentions a portal surface | `ldev portal inventory ...` |
| Pre-mutation check | Before any resource change | `ldev resource import-* --check-only` |
| Mutation | After check-only passes | `ldev resource import-*`, `ldev deploy ...` |
| Post-mutation verify | After any mutation | Resource changes: read back via `ldev resource get-*` / `ldev resource export-*` / `ldev portal inventory ... --json`. Runtime/deploy changes: `ldev logs diagnose --since 5m --json`, `ldev portal check --json`. |

Key invariants (full list in `AGENTS.md → Safety Invariants`):

- Always read `liferay.portalUrl` from context — never assume.
- Always consume `--json`. Never parse human-readable output.
- Always run `--check-only` before resource mutations.
- Never use plural resource commands without explicit human approval.
- Do not treat `ldev logs diagnose` as universal verification for resource
  imports; prefer read-after-write evidence from `ldev resource` /
  `ldev portal inventory`.
- Diagnose before retrying a failed command.

## Why this matters

Without this layer, an agent connected to Liferay can read state but
cannot operate it. With it, an agent can stand up an environment, import a
structure, run a migration check, deploy a module and verify the result —
end to end, with the same evidence a developer would gather.

That is what makes `ldev` useful for AI workflows. Not the buzzword. The
fact that the operations actually exist as commands.

Put differently: we did not build AI features. We fixed the systems problem
in Liferay — operations as data, reproducible environments, isolated
runtimes, guardrails before mutation, structured output. All of that was
already worth doing for humans. The AI integration came along for the ride.
See [Why ldev Exists](/core-concepts/why-ldev-exists) for the long form.
