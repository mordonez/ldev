---

description: MCP guidance for Liferay based on ldev's runtime audit
globs: *
alwaysApply: true

---

# Liferay MCP Guidance

- Treat MCP as a protocol surface for portal interoperability, not as a replacement for local development workflows.
- Use `ldev mcp check --json`, `ldev mcp probe --json`, and `ldev mcp openapis --json` to validate the MCP surface from the current runtime.
- Enable the feature flag before expecting MCP to be available:

```properties
feature.flag.LPD-63311=true
```

- The MCP endpoint path varies by product version. Always run `ldev mcp check --json` to discover the correct endpoint for the active runtime. Do not hardcode `/o/mcp` or `/o/mcp/sse` without first verifying with `ldev`.

Use MCP when:

- a tool wants generic portal interoperability
- you need to inspect OpenAPI exposure quickly
- there is no higher-level `ldev` workflow for the task

Prefer direct `ldev` workflows when:

- you need local runtime context
- you need task-shaped portal discovery such as `portal inventory`
- you need diagnostics that combine local state and portal state
