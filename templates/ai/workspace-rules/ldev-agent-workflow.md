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

- `ldev portal inventory sites --json`
- `ldev portal inventory pages --site /my-site --json`
- `ldev portal inventory page --url /web/guest/home --json`
- `ldev resource export-structures --site /my-site --json`
- `ldev deploy all --format json`

Use the official Liferay MCP only when it provides something that a direct `ldev` command does not already provide.
