# GEMINI

Gemini Code Assist entrypoint for this project. Installed by `ldev ai install`.

This file is intentionally thin. Read `AGENTS.md` first for the canonical
bootstrap, safety invariants, worktree rules, and installed skills.

## Read First

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/ai/project-context.md` if it exists
4. `docs/ai/project-learnings.md` if it exists
5. matching task skill under `.agents/skills/`
6. `.gemini/ldev-*.md` files for installed workspace rules

## Gemini-specific note

- Do not treat this file as an independent workflow.
- Use `AGENTS.md` as the single source of truth for bootstrap and safety rules.
- The canonical mutating-task bootstrap is `ldev ai bootstrap --intent=develop --cache=60 --json`.
- When a task-specific skill exists, read it after `AGENTS.md` before acting.
