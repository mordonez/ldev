---

description: Deploy guidance for blade-workspace projects
globs: *
alwaysApply: false

---

# Blade Workspace Deploy

Use this rule only when the project type is `blade-workspace`.

Primary deploy model:

- use `blade gw deploy` for standard Workspace deploy flows
- use `blade gw tasks` to inspect available Gradle tasks
- use `ldev deploy module <module-name>` when a module or deployable Gradle unit changed
- use a a broad deploy only when a human explicitly asks for a full deploy and
  the change cannot be proved with a narrower deploy

Prefer atomic deploys. Do not use a broad deploys as a default validation step.

Do not use deploy commands for Journal templates, ADTs, fragments, or
structures. Those live in the portal runtime; apply them with
`ldev resource import-*` and validate browser-visible behavior with
`playwright-cli`.

For Client Extensions:

- keep the source in the conventional Workspace locations
- verify the bundle exists before expecting deploy/registration to work
- confirm activation by checking logs and portal behavior after deploy

Useful verification steps:

- `ldev status --json`
- `ldev logs --no-follow`
- `ldev portal check --json`
