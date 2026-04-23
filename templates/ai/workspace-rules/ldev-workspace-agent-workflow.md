---

description: High-level `ldev` workflow guidance for humans and agents in a Liferay Workspace
globs: *
alwaysApply: true

---

# `ldev` Agent Workflow

- Treat the official Liferay Workspace AI files as the base layer.
- Treat `AGENTS.md` as the bootstrap entrypoint.
- Use this rule only as a short policy reminder: `ldev` is the workflow layer on top of Workspace, not a replacement for it.

Preferred task-shaped entry points after bootstrap:

- `ldev ai bootstrap --intent=discover --json`
- `ldev ai bootstrap --intent=develop --json`
- `ldev ai bootstrap --intent=deploy --json`
- `ldev context --json`
- `ldev portal inventory sites --json`
- `ldev portal inventory pages --site /my-site --json`
- `ldev portal inventory page --url /web/guest/home --json`
- `ldev resource export-structure --site /my-site --key <key> --json`
- `ldev resource export-template --site /my-site --id <id> --json`
- `ldev resource import-structure --site /my-site --key <key> --check-only`
- `ldev deploy module <module-name> --format json`

Run `ldev doctor --json` only when you need diagnosis beyond the bootstrap
readiness result. Run
`ldev mcp check --json` only when the task depends on MCP or when no direct
`ldev` command covers the required portal surface.

Use the official Liferay MCP only when it provides something that a direct `ldev` command does not already provide.

Prefer atomic commands. Do not use plural resource commands or a broad deploy
unless a human explicitly asks for a bulk operation and the risk is written down
first.

If you are inside a worktree and need read-only discovery against the main
runtime, keep the current shell where it is and prefix the command with
`ldev --repo-root <main-root>` instead of changing directories.

Do not use deploy commands for Journal templates, ADTs, fragments, or
structures. Those are runtime resource changes: use `ldev resource import-*`
and validate browser-visible behavior with `playwright-cli`.
