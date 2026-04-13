# CLAUDE.md

Claude should read this file after `AGENTS.md`.

## Purpose

This file is the Claude-specific entrypoint for project-owned context. Keep it
short. Put long-lived project knowledge in [docs/ai/project-context.md](docs/ai/project-context.md) if that file exists.
Use [docs/ai/project-context.md.sample](docs/ai/project-context.md.sample) only
as a human template when creating the real project context file.

## Read Next

1. `AGENTS.md`
2. `docs/ai/project-context.md` if it exists
3. `docs/ai/project-learnings.md` if it exists
4. Any task-specific skill under `.agents/skills/`

## Task Routing

**GitHub issue (any bug, feature request, or improvement):**
Read `.agents/skills/project-issue-engineering/SKILL.md` **before doing anything else**.
It defines the project issue workflow: intake → technical routing → validation → PR.
If the repository has `ldev-native` capabilities available, follow its optional
isolated worktree guidance before mutating runtime state.

**Liferay technical work (not issue-driven):**
Start with `.agents/skills/liferay-expert/SKILL.md` to route to the right specialist skill.

## Claude-Specific Notes

- Use this file only for Claude-facing routing or constraints that should not
  live in vendor-managed `AGENTS.md`.
- If knowledge is reusable across agents or grows beyond a short page, move it
  into `docs/ai/project-context.md` when the project uses that file.
- Treat `docs/ai/project-context.md.sample` as onboarding scaffolding for
  humans, not as project truth for the agent.
- If a workflow becomes reusable across projects, move it out of project docs
  and into a proper skill.
