# AGENTS

Standard entrypoint for coding agents working in a project that uses `ldev`.

This file is intentionally small. It defines the stable bootstrap, the default
operating rules, and where to find deeper task playbooks.

Project-specific context lives outside this file:

- `CLAUDE.md` routes Claude to project-owned context docs.
- `docs/ai/project-context.md` is the optional long-form project knowledge document.

## Required Bootstrap

Before changing code or runtime state:

1. Run `ldev doctor`.
2. Run `ldev context --json`.
3. Run `ldev mcp check --json` to check MCP availability. This step is
   informational — continue even if MCP is not available or not configured.
4. Read `CLAUDE.md`.
5. Read the task-specific skill under `.agents/skills/` if one applies.

Use `ldev --help` as the source of truth for the public CLI surface.

## Default Operating Rules

- Use `ldev` as the official entrypoint. Do not fall back to legacy wrappers or
  ad hoc project scripts when an `ldev` command already exists.
- Before using a `git`, `blade`, or ad hoc shell command to accomplish something,
  check `ldev --help` to verify no `ldev` equivalent exists.
- Never use `git worktree add` directly. Use `ldev worktree setup --name <name> --with-env`
  instead — it handles environment isolation, database copying, and Btrfs snapshots
  on top of the git worktree. `git worktree add` alone is incomplete and unsafe for
  this workflow.
- After creating an isolated worktree, immediately `cd` into it and confirm the
  editing root with `git rev-parse --show-toplevel`. Do not edit files whose
  absolute path belongs to the primary checkout when the task requires a
  worktree.
- Treat the confirmed worktree root as an edit boundary, not a one-time check.
  Before any file edit, make sure the tool `workdir` and every target path are
  under that root. Re-run the check after interruptions, context resumes, shell
  changes, or any step that may have changed directories.
- Prefer the task-shaped public contract first:
  - `ldev doctor --json`
  - `ldev context --json`
  - `ldev mcp check --json`
  - `ldev portal check --json`
  - `ldev portal inventory ... --json`
  - `ldev logs diagnose --json`
- For scripting and agents, prefer machine-readable output:
  - `ldev doctor --json`
  - `ldev context --json`
  - `ldev status --json`

## MCP Usage

- Treat MCP as optional. Do not assume it is enabled in every runtime.
- Always run `ldev mcp check --json` before planning around MCP.
- For agents and reusable skills, prefer OAuth2 via `ldev oauth install --write-env` instead of MCP Basic auth with a human username/password.
- Treat MCP username/password auth as a quick manual test path, not as the default agent bootstrap.
- If MCP is available and the task is generic OpenAPI discovery or generic endpoint execution, MCP can be the shortest path.
- If the task is local-runtime diagnosis or opinionated portal discovery, prefer `ldev` commands first.

Use MCP for:

- discovering available OpenAPIs
- retrieving one OpenAPI spec
- calling a generic portal endpoint when no higher-level `ldev` command exists

Prefer `ldev` for:

- runtime diagnosis
- OAuth/bootstrap
- site and page discovery
- page inspection and other task-shaped workflows

## Project-Specific Knowledge

`ldev` installs reusable skills, not project-specific know-how.

Keep project-owned knowledge in project files, not in vendor-managed skills.

Recommended locations:

- `CLAUDE.md` for Claude-specific routing and instructions
- `docs/ai/project-context.md` for maintainable long-form project context
- extra skills under `.agents/skills/project-*` for project-owned workflows

Read order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/ai/project-context.md` if it exists
4. `docs/ai/project-learnings.md` if it exists
5. All files under `.workspace-rules/` if that directory exists
6. task-specific skills under `.agents/skills/`

## Installed Skills

Use these as the standard reusable entrypoints when the task needs a deeper playbook:

- `liferay-expert`: router for technical Liferay work.
- `developing-liferay`: implementation guidance for code, themes, content resources and fragments.
- `deploying-liferay`: build, deploy and runtime verification flow.
- `troubleshooting-liferay`: diagnosis and recovery flow.
- `migrating-journal-structures`: safe Journal migration playbook.
- `automating-browser-tests`: Playwright browser checks, visual evidence and page-editor workflows.
{{LIFECYCLE_SKILLS_SECTION}}

## Validation

After installing or updating vendor skills:

1. Review `.agents/skills/`.
2. Update `CLAUDE.md` and add `docs/ai/project-context.md` only if the project will maintain it.
3. Add any project-owned skills with the `project-` prefix.
