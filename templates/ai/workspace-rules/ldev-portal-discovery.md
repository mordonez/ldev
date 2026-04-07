---

description: Portal discovery guidance using `ldev portal inventory`
globs: *
alwaysApply: false

---

# `ldev` Portal Discovery

For discovery tasks, prefer `ldev portal inventory` before constructing low-level API flows by hand.

Recommended sequence:

1. `ldev portal inventory sites --json`
2. `ldev portal inventory pages --site /my-site --json`
3. `ldev portal inventory page --url /web/my-site/home --json`

Why:

- the output is already shaped for the task
- the JSON contract is stable
- it includes Liferay-specific enrichment that low-level APIs do not provide directly

Use MCP or direct OpenAPI work only when you need an additional portal action that `ldev` does not already expose cleanly.
