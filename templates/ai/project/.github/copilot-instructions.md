# Copilot Instructions

This file is intentionally thin. Read `AGENTS.md` first for the canonical
bootstrap, safety invariants, worktree rules, and installed skills.

## Read First

1. `AGENTS.md`
2. `docs/ai/project-context.md` if it exists
3. `docs/ai/project-learnings.md` if it exists
4. matching task skill under `.agents/skills/`

## Agent Portability Contract

Same prompt, same gate order. This file delegates to `AGENTS.md`; it does not
define a Copilot-only workflow. See `AGENTS.md` for the full portability
contract, slash command resolution, and project-issue-engineering gate.

- Do not duplicate or reinterpret the operating contract here.
- Use `AGENTS.md` as the single source of truth for bootstrap and safety rules.
- When `.agents/skills/project-issue-engineering/SKILL.md` exists and the task mutates code, resources, or runtime state, read it immediately after `AGENTS.md`.
