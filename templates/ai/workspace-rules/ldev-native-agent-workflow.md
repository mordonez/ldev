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
- `ldev resource export-structure --site /my-site --key <key> --json`
- `ldev resource export-template --site /my-site --id <id> --json`
- `ldev resource import-structure --site /my-site --key <key> --check-only`
- `ldev deploy module <module-name> --format json`
- `ldev deploy theme --format json`

Prefer `ldev` commands over raw Docker or shell equivalents. Use MCP only when it provides something a direct `ldev` command does not already cover.

Prefer atomic commands. Do not use plural resource commands or a broad deploy
unless a human explicitly asks for a bulk operation and the risk is written down
first.

When an issue starts from a URL, do not reproduce or validate against the
production host. Resolve the page through `ldev portal inventory page --url`,
switch to the local runtime URL, and inspect that page before searching code.
Use page inspection to identify the concrete ADT, template, fragment, module,
or theme surface first; broad grep comes after that.

Deploy commands are only for deployable artifacts. Use `ldev deploy theme`
when the theme changed, and `ldev deploy module <module-name>` when modules or
deployable Gradle units changed. For Journal templates, ADTs, fragments, and
structures, use the runtime resource import workflow and validate the affected
page with `playwright-cli`.

Before creating an isolated worktree, verify the current branch. If the primary
checkout is not on `main`, pass the intended `--base <ref>` explicitly instead
of letting the worktree branch from a feature branch by accident.

After creating a worktree, immediately enter it and prove the editing root
before touching files:

```bash
cd .worktrees/<name>
git rev-parse --show-toplevel
git status --short
```

Creating the worktree does not mean later tool writes are automatically scoped
to it. Before the first edit, confirm every file path you will edit starts with
the worktree root. If a path points at the primary checkout, stop and correct the
working directory before writing.
