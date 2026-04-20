# GEMINI

Gemini Code Assist entrypoint for this project. Installed by `ldev ai install`.

This file is intentionally concise. Read `AGENTS.md` for the full operating contract,
safety invariants, and skill index.

## Read First

1. `AGENTS.md` — bootstrap procedure, safety invariants, and installed skills.
2. `docs/ai/project-context.md` if it exists — long-form project knowledge.
3. `docs/ai/project-learnings.md` if it exists — captured session learnings.
4. Task-specific skill under `.agents/skills/` if one applies.
5. `.gemini/ldev-*.md` files — Liferay and ldev workspace rules installed alongside this file.

## Bootstrap

Before changing code or runtime state:

1. `ldev context --json` — resolves `env.portalUrl`, `paths.*`, `liferay.oauth2Configured`, `commands.*`.
2. `ldev doctor --json` — only when the task depends on runtime health, installed tools, or deploy verification.
3. `ldev mcp check --json` — only when the task depends on MCP or no direct `ldev` command covers the required portal surface.

Use `ldev --help` as the source of truth for the public CLI surface.

## Task Routing

**GitHub issue (bug, feature request, or improvement):**
Read `.agents/skills/project-issue-engineering/SKILL.md` **before doing anything else**.
It defines the project issue workflow: intake → technical routing → validation → PR.

**Liferay technical work (not issue-driven):**
Start with `.agents/skills/liferay-expert/SKILL.md` to route to the right specialist skill.

## Installed Skills

| Skill | Use When |
|---|---|
| `liferay-expert` | Technical Liferay work — routes to the right specialist |
| `developing-liferay` | Code, themes, structured content, fragments |
| `deploying-liferay` | Build, deploy, runtime verification |
| `troubleshooting-liferay` | Diagnosis and recovery |
| `migrating-journal-structures` | Safe Journal structure migration |
| `automating-browser-tests` | Playwright, visual evidence, page-editor workflows |
| `capturing-session-knowledge` | End-of-session knowledge capture to `docs/ai/project-learnings.md` |

Each skill has a `SKILL.md` under `.agents/skills/<name>/`. Read it before starting the task.

## ldev Command Resolution

1. Try `ldev` directly.
2. If not in PATH: `npx @mordonezdev/ldev ...`
3. Windows PowerShell fallback: `npx.cmd @mordonezdev/ldev ...`

## Safety Invariants

1. Always start with `ldev context --json`. Use `commands.*` to verify readiness.
2. Use `--json` output for all automation. Never parse human-readable ldev text.
3. Run `--check-only` before any resource mutation (`import-structure`, `import-template`, `import-adt`, `import-fragment`).
4. Use the smallest deploy or import that proves the change. Never broad-deploy as validation.
5. Never use plural resource commands without explicit human approval.
6. After any mutation, verify with `ldev portal inventory ...` or `ldev logs diagnose --since 5m --json`.
7. Never guess IDs, keys, or site names — use `ldev portal inventory ...` to resolve them.
8. Never assume the portal URL — read `env.portalUrl` from `ldev context --json`.
9. Never use `git worktree add` directly — use `ldev worktree setup --name <name> --with-env`.
10. If a command fails, diagnose first (`ldev logs diagnose --json` or `ldev doctor --json`) before retrying.
