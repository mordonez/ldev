---

description: Deploy guidance for ldev-native repositories
globs: *
alwaysApply: false

---

# ldev-native Deploy

Use this rule only when the project type is `ldev-native`.

Primary deploy model:

- `ldev deploy all` for the main rebuild/deploy loop
- `ldev deploy module <name>` for focused rebuilds
- `ldev deploy theme` for theme-specific rebuilds
- `ldev deploy status` to verify what the runtime observed

The native runtime is built around the `docker/` + `liferay/` layout, so deploy behavior is more tightly coupled to the local runtime than in a standard Blade Workspace.

Useful verification steps after deploy:

- `ldev deploy status`
- `ldev osgi status --json`
- `ldev logs diagnose --json`
- `ldev portal check --json`

Treat raw Docker or filesystem deploy steps as implementation details unless there is a project-specific reason to bypass `ldev`.
