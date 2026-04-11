# AGENTS

Standard entrypoint for coding agents working in a **Liferay Workspace** that uses `ldev`.

This file is intentionally small. In a Workspace, the official Liferay AI files
are the base layer. `ldev` augments that base with direct workflows, runtime
guidance, and reusable skills on top.

## Base Context

Treat these files as the primary Workspace guidance:

- `.workspace-rules/*.md`
- `.claude/CLAUDE.md`
- tool-specific Workspace AI files under `.cursor/`, `.gemini/`, `.github/`, `.windsurf/`

`ldev` installs complementary `ldev-*` rule files in those locations. Do not
replace the official Workspace files with vendor-specific rewrites.

Mental model:

- official AI Workspace files explain the standard Liferay Workspace baseline
- `ldev` adds task-shaped workflows, runtime diagnostics, deploy verification,
  OAuth bootstrap, MCP checks, and agent-oriented shortcuts

If both layers speak to the same topic:

- keep the official Workspace files as the base source
- treat `ldev-*` rules as the augmentation layer for direct operational work

## Required Bootstrap

Before changing code or runtime state:

1. Run `ldev doctor --json`.
2. Run `ldev context --json`.
3. Run `ldev mcp check --json` to check MCP availability. This step is
   informational — continue even if MCP is not available or not configured.
4. Read `docs/ai/project-context.md` if it exists.
5. Read the task-specific skill under `.agents/skills/` if one applies.

Use `ldev --help` as the source of truth for the public CLI surface.

## Workflow Rule

Prefer direct, task-shaped `ldev` commands before assembling low-level portal
operations manually.

Examples:

- `ldev portal inventory sites --json`
- `ldev portal inventory page --url /web/guest/home --json`
- `ldev resource export-structure --site /my-site --key <key> --json`
- `ldev resource export-template --site /my-site --id <id> --json`

Use the official Liferay MCP only when it provides something that a direct
`ldev` command does not already provide.

Prefer atomic commands. Do not use plural resource commands or a broad deploy
unless a human explicitly asks for a bulk operation and the risk is written down
first.

Use vendor skills for the full reusable workflow:

- `liferay-expert`
- `troubleshooting-liferay`
- `developing-liferay`
- `deploying-liferay`
- `migrating-journal-structures`
- `automating-browser-tests`

Use `.workspace-rules/ldev-*.md` files to adapt those workflows to the
Workspace runtime and to coexist cleanly with the official AI Workspace rules.

Before using MCP:

- verify it with `ldev mcp check --json`
- for agents and reusable skills, prefer OAuth2 via `ldev oauth install --write-env` instead of MCP Basic auth with a human username/password
- treat MCP username/password auth as a quick manual test path, not as the default agent bootstrap
- prefer the `ldev`-managed MCP guidance if it conflicts with older Workspace template assumptions
- use MCP for generic OpenAPI discovery and endpoint execution, not as the default replacement for `ldev portal inventory`

## Default Operating Rules

- Before using a `git`, `blade`, or ad hoc shell command to accomplish something,
  check `ldev --help` to verify no `ldev` equivalent exists.
- If this repository uses isolated worktrees through `ldev`, never use `git worktree add`
  directly. Use `ldev worktree setup --name <name> --with-env` instead — it handles
  environment isolation, database copying, and Btrfs snapshots on top of the git
  worktree. `git worktree add` alone is incomplete and unsafe for that workflow.
- After creating an isolated worktree, immediately `cd` into it and confirm the
  editing root with `git rev-parse --show-toplevel`. Do not edit files whose
  absolute path belongs to the primary checkout when the task requires a
  worktree.
- Use **Blade/Liferay Workspace** as the standard project structure.
- Use `blade` commands when Workspace rules or docs call for them.
- Use `ldev` for diagnostics, context discovery, deploy verification, and
  agent-friendly workflows.
- Prefer singular resource commands (`export-structure`, `export-template`,
  `export-adt`, `export-fragment`, `import-structure`, `import-template`,
  `import-adt`, `import-fragment`) over plural commands.
- Prefer `ldev deploy module <module-name>` or `ldev deploy theme` over broader
  deploy commands. Do not use a broad deploy as a default validation step.
- Prefer the task-shaped public contract first:
  - `ldev doctor --json`
  - `ldev context --json`
  - `ldev mcp check --json`
  - `ldev portal check --json`
  - `ldev portal inventory ... --json`
  - `ldev logs diagnose --json`

## Project-Specific Knowledge

Keep project-owned knowledge outside vendor-managed files.

Recommended locations:

- `docs/ai/project-context.md`
- `.agents/skills/project-*`
- repository docs that describe team-specific architecture or workflows

If `.agents/skills/project-issue-engineering/` exists and the task is driven by
a GitHub issue or project issue workflow, read that skill for repository
process after bootstrap. Use vendor skills for the technical execution itself.

## Installed Skills

Use these as the standard reusable entrypoints:

- `liferay-expert`
- `developing-liferay`
- `deploying-liferay`
- `troubleshooting-liferay`
- `migrating-journal-structures`
- `automating-browser-tests`
{{LIFECYCLE_SKILLS_SECTION}}

## Validation

After installing or updating vendor AI assets:

1. Review `.workspace-rules/ldev-*.md`.
2. Review the tool-specific generated files under `.claude/`, `.cursor/`,
   `.gemini/`, `.github/`, and `.windsurf/`.
3. Keep official Liferay Workspace files intact.
4. Treat `ldev` as augmentation, not replacement, for the Workspace AI layer.
