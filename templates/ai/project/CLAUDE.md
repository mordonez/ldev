# CLAUDE.md

Claude should read this file after `AGENTS.md`.

## Purpose

This file is the Claude-specific entrypoint for project-owned context. Keep it
short. Put long-lived project knowledge in [docs/ai/project-context.md](docs/ai/project-context.md) if that file exists.

## Read Next

1. `AGENTS.md`
2. `docs/ai/project-context.md` if it exists
3. `docs/ai/project-learnings.md` if it exists
4. Any task-specific skill under `.agents/skills/`

## Task Routing

**Any task that changes code, resources, or runtime state (GitHub issue, chat request, or ad-hoc request):**
If the request is ambiguous about which Site, Page, resource, module, or surface it targets, route to `.agents/skills/clarifying-liferay-tasks/SKILL.md` first to lock the surface before any other workflow.
If `.agents/skills/project-issue-engineering/SKILL.md` exists, read it next for non-trivial work (bug fixes, features, migrations, anything with reproduction risk). For clearly trivial ad-hoc requests where the developer has explicitly scoped the exact change they want, confirm with them whether to follow the full issue engineering workflow or proceed directly — then act per their answer.

If the repository has `ldev-native` capabilities available, worktree isolation is the recommended default for significant changes. For trivial changes, ask the developer before creating a worktree — they may prefer to work directly in the current checkout.
Use `.agents/skills/isolating-worktrees/SKILL.md` for the canonical setup and edit-root lock flow when worktree isolation is used.

**Liferay technical execution after issue workflow intake/reproduction gates:**
Use `.agents/skills/liferay-expert/SKILL.md` to route to the right specialist skill.

## Claude-Specific Notes

- Use this file only for Claude-facing routing or constraints that should not
  live in vendor-managed `AGENTS.md`.
- If knowledge is reusable across agents or grows beyond a short page, move it
  into `docs/ai/project-context.md` when the project uses that file.
- Treat `docs/ai/project-context.md.sample` as onboarding scaffolding for
  humans, not as project truth for the agent.
- If a workflow becomes reusable across projects, move it out of project docs
  and into a proper skill.
