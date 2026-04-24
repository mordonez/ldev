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

## Copilot-specific note

- Do not duplicate or reinterpret the operating contract here.
- The canonical mutating-task bootstrap is `ldev ai bootstrap --intent=develop --cache=60 --json`.
- Follow `AGENTS.md` for readiness gating via `context.commands.*` and `doctor.readiness.*`.
- When `.agents/skills/project-issue-engineering/SKILL.md` exists and the task mutates code, resources, or runtime state, read it immediately after `AGENTS.md`.
