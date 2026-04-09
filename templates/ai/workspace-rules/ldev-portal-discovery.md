---

description: Portal discovery guidance using `ldev portal inventory`
globs: *
alwaysApply: false

---

# `ldev` Portal Discovery

For discovery tasks, prefer `ldev portal inventory` before constructing
low-level API flows by hand.

Recommended sequence:

1. `ldev portal inventory sites --json`
2. `ldev portal inventory pages --site /my-site --json`
3. `ldev portal inventory page --url /web/my-site/home --json`

Why:

- task-shaped output
- stable JSON contract
- better page/context enrichment than low-level API assembly

For the full workflow, route to vendor skills such as:

- `liferay-expert`
- `developing-liferay`
- `troubleshooting-liferay`

Use MCP or direct OpenAPI work only when `ldev` does not already expose the
needed portal action cleanly.
