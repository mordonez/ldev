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

## Agent Portability Contract

Same prompt, same gate order. This file delegates to `AGENTS.md`; it does not
define a Gemini-only workflow.

Slash commands are aliases. If the user invokes `/project-issue-engineering`,
`$project-issue-engineering`, names a skill, or pastes a skill body, resolve it
to the matching file under `.agents/skills/` and follow that skill. For
non-trivial code, resource, or runtime mutations, read `.agents/skills/project-issue-engineering/SKILL.md`
when it exists, even if the current assistant does not implement slash commands
natively.

## Gemini-specific note

- Do not treat this file as an independent workflow.
- Use `AGENTS.md` as the single source of truth for bootstrap and safety rules.
- The canonical mutating-task bootstrap is `ldev ai bootstrap --intent=develop --cache=60 --json`.
- When a task-specific skill exists, read it after `AGENTS.md` before acting.
