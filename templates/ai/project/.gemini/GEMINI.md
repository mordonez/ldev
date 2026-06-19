# GEMINI

Gemini Code Assist entrypoint for this project.

This file is intentionally thin. Read `AGENTS.md` first for the canonical
bootstrap, safety invariants, worktree rules, and installed skills.

## Read First

1. `AGENTS.md`
2. `docs/ai/project-context.md` if it exists
3. `docs/ai/project-learnings.md` if it exists
4. matching task skill under `.agents/skills/`

## Agent Portability Contract

Same prompt, same gate order. This file delegates to `AGENTS.md`; it does not
define a Gemini-only workflow. See `AGENTS.md` for the full portability
contract, slash command resolution, and project-issue-engineering gate.

- Do not treat this file as an independent workflow.
- Use `AGENTS.md` as the single source of truth for bootstrap and safety rules.
- When a task-specific skill exists, read it after `AGENTS.md` before acting.
