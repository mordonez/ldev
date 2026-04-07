# AGENTS

Standard entrypoint for coding agents working in a **Liferay Workspace** that uses `ldev`.

This file is intentionally small. In a Workspace, the official Liferay AI files
are the base layer. `ldev` adds direct workflows and reusable skills on top.

## Base Context

Treat these files as the primary Workspace guidance:

- `.workspace-rules/*.md`
- `.claude/CLAUDE.md`
- tool-specific Workspace AI files under `.cursor/`, `.gemini/`, `.github/`, `.windsurf/`

`ldev` installs complementary `ldev-*` rule files in those locations. Do not
replace the official Workspace files with vendor-specific rewrites.

## Required Bootstrap

Before changing code or runtime state:

1. Run `ldev doctor --json`.
2. Run `ldev context --json`.
3. Run `ldev mcp check --json`.
4. Read `docs/ai/project-context.md` if it exists.
5. Read the task-specific skill under `.agents/skills/` if one applies.

Use `ldev --help` as the source of truth for the public CLI surface.

## Workflow Rule

Prefer direct, task-shaped `ldev` commands before assembling low-level portal
operations manually.

Examples:

- `ldev portal inventory sites --json`
- `ldev portal inventory page --url /web/guest/home --json`
- `ldev resource export-structures --site /my-site --json`

Use the official Liferay MCP only when it provides something that a direct
`ldev` command does not already provide.

Before using MCP:

- verify it with `ldev mcp check --json`
- for agents and reusable skills, prefer OAuth2 via `ldev oauth install --write-env` instead of MCP Basic auth with a human username/password
- treat MCP username/password auth as a quick manual test path, not as the default agent bootstrap
- prefer the `ldev`-managed MCP guidance if it conflicts with older Workspace template assumptions
- use MCP for generic OpenAPI discovery and endpoint execution, not as the default replacement for `ldev portal inventory`

## Default Operating Rules

- Use **Blade/Liferay Workspace** as the standard project structure.
- Use `blade` commands when Workspace rules or docs call for them.
- Use `ldev` for diagnostics, context discovery, deploy verification, and
  agent-friendly workflows.
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
