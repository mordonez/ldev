---

description: High-level `ldev` workflow guidance for humans and agents in an ldev-native project
globs: *
alwaysApply: true

---

# `ldev` Agent Workflow

- Treat `AGENTS.md` as the bootstrap entrypoint.
- `ldev` owns the full runtime contract in this project type.

Preferred task-shaped entry points after bootstrap:

- `ldev context --json`
- `ldev doctor --json`
- `ldev status --json`
- `ldev portal inventory sites --json`
- `ldev portal inventory pages --site /my-site --json`
- `ldev portal inventory page --url /web/guest/home --json`
- `ldev resource export-structures --site /my-site --json`
- `ldev deploy all --format json`

Prefer `ldev` commands over raw Docker or shell equivalents. Use MCP only when it provides something a direct `ldev` command does not already cover.
