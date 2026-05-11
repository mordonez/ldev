# Copilot Instructions

Installed by `ldev ai install`.

This file is intentionally thin. Read `AGENTS.md` first for the canonical
bootstrap, safety invariants, worktree rules, and installed skills.

## Read First

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/ai/project-context.md` if it exists
4. `docs/ai/project-learnings.md` if it exists
5. matching task skill under `.agents/skills/`

## Agent Portability Contract

Same prompt, same gate order. This file delegates to `AGENTS.md`; it does not
define a Copilot-only workflow.

Slash commands are aliases. If the user invokes `/project-issue-engineering`,
`$project-issue-engineering`, names a skill, or pastes a skill body, resolve it
to the matching file under `.agents/skills/` and follow that skill. For
non-trivial code, resource, or runtime mutations, read `.agents/skills/project-issue-engineering/SKILL.md`
when it exists, even if the current assistant does not implement slash commands
natively.

## Copilot-specific note

- Do not duplicate or reinterpret the operating contract here.
- The canonical mutating-task bootstrap is `ldev ai bootstrap --intent=develop --cache=60 --json`.
- Follow `AGENTS.md` for readiness gating via `context.commands.*` and `doctor.readiness.*`.
- When `.agents/skills/project-issue-engineering/SKILL.md` exists and the task mutates code, resources, or runtime state, read it immediately after `AGENTS.md`.
