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
- use `ldev deploy all` as the higher-level shortcut and workflow entry point

For Client Extensions:

- keep the source in the conventional Workspace locations
- verify the bundle exists before expecting deploy/registration to work
- confirm activation by checking logs and portal behavior after deploy

Useful verification steps:

- `ldev deploy all --format json`
- `ldev status --json`
- `ldev logs --no-follow`
- `ldev portal check --json`
