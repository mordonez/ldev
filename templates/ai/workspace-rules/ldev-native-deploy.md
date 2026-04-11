---

description: Deploy guidance for ldev-native repositories
globs: *
alwaysApply: false

---

# ldev-native Deploy

Use this rule only when the project type is `ldev-native`.

Primary deploy model:

- `ldev deploy module <name>` when modules or deployable Gradle units changed
- `ldev deploy theme` when the theme changed
- a broad deploy only when a human explicitly asks for a full deploy and the
  change cannot be proved with a narrower deploy
- `ldev deploy status` to verify what the runtime observed

Prefer atomic deploys. Do not use a broad deploys as a default validation step.

Do not use deploy commands for Journal templates, ADTs, fragments, or
structures. Those live in the portal runtime; apply them with
`ldev resource import-*` and validate the affected portal flow with
`playwright-cli`.

The native runtime is built around the `docker/` + `liferay/` layout, so deploy behavior is more tightly coupled to the local runtime than in a standard Blade Workspace.

Useful verification steps after deploy:

- `ldev deploy status`
- `ldev osgi status --json`
- `ldev logs diagnose --json`
- `ldev portal check --json`

Treat raw Docker or filesystem deploy steps as implementation details unless there is a project-specific reason to bypass `ldev`.
