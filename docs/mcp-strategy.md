# MCP Strategy

`ldev` should help humans and agents use the official Liferay MCP where it adds value, without making MCP a hard dependency for core workflows.

## Current position

Use this mental model:

1. **Liferay Workspace** defines the standard project shape.
2. **Liferay MCP** provides an official portal protocol surface.
3. **`ldev`** provides direct local-development and agent workflows.

That means:

- use `ldev` first for environment context, runtime diagnosis, OAuth bootstrap, and opinionated portal discovery
- use MCP when generic OpenAPI discovery or generic endpoint execution is the shortest path
- do not assume MCP is always enabled or fully usable in every runtime

## What MCP is good at today

In the validated runtime, the official Liferay MCP server exposes:

- `get-openapis`
- `get-openapi`
- `call-http-endpoint`

That makes MCP useful for:

- discovering which OpenAPI surfaces exist
- retrieving an OpenAPI document
- calling a generic headless endpoint through the official protocol

This is valuable for agents that need to:

- explore available APIs dynamically
- avoid hardcoding one specific headless family
- execute generic create/read/update/delete operations once the right endpoint is known

For the default OAuth2 app that `ldev` installs, see [OAuth2 Scopes](/oauth-scopes).
The product stance is:

- install the minimum scope set that makes `ldev` core workflows work
- include MCP discovery scopes by default
- leave broader admin/API-family scopes as explicit opt-ins

Authentication stance:

- for a quick manual MCP check, username/password auth is acceptable
- for agents, reusable skills, and automation, prefer OAuth2 provisioned through `ldev oauth install --write-env`
- `ldev` does not replace MCP auth; it gives teams a safer and more operable credential path than reusing a human password

## What `ldev` should continue to own

MCP does not replace the workflows where `ldev` is already stronger:

- `ldev doctor --json`
- `ldev context --json`
- `ldev status --json`
- `ldev oauth install --write-env`
- `ldev portal check --json`
- `ldev portal inventory ... --json`
- `ldev logs diagnose --json`

These commands remain better for:

- local runtime diagnosis
- auth/bootstrap
- stable task-shaped outputs
- Liferay-specific discovery with opinionated enrichment
- workflows that chain cleanly in agent sessions

Examples:

- use `ldev portal inventory sites --json` instead of asking an agent to discover which site API to call first
- use `ldev portal inventory page --url /web/guest/home --json` instead of composing multiple low-level page, fragment, and content calls

## Practical split

| Task | Best interface | Why |
| --- | --- | --- |
| Check runtime prerequisites | `ldev` | `doctor` and `context` understand the local environment |
| Verify MCP availability | `ldev` | `mcp check` and `mcp probe` make the preflight explicit |
| Discover available OpenAPIs | MCP | `get-openapis` is the official source |
| Retrieve an OpenAPI spec | MCP | `get-openapi` avoids manual discovery |
| Call a generic headless endpoint | MCP | `call-http-endpoint` is the right primitive |
| Discover sites/pages/page trees | `ldev` | `portal inventory` is shorter and more stable |
| Inspect page fragments/widgets/admin links | `ldev` | `ldev` adds product-shaped interpretation |
| Diagnose logs, health, deploy state | `ldev` | MCP does not cover the local runtime |
| Solve end-to-end agent tasks | hybrid | `ldev` for context and routing, MCP for generic portal actions |

## Recommended agent flow

For agent sessions, start here:

```bash
ldev doctor --json
ldev context --json
ldev mcp check --json
```

Then choose the shortest path:

1. if the task is local-runtime or task-shaped discovery, use `ldev`
2. if the task is generic headless execution and MCP is healthy, use MCP
3. if the task spans both, use `ldev` to prepare context and MCP to execute generic portal calls

Typical sequence:

```bash
ldev doctor --json
ldev context --json
ldev mcp check --json
ldev portal inventory sites --json
```

Then, if needed:

- use MCP to inspect OpenAPIs
- pick one API family
- execute the specific endpoint through MCP

## Important caveats

- MCP may be enabled in one runtime and absent in another
- a runtime can have the MCP bundle present but still require the feature flag to be effective at request time
- the correct credentials matter; MCP behavior can look broken when auth is simply wrong
- MCP tool availability does not automatically mean every tool path is equally useful for humans or agents

`ldev` should therefore treat MCP as:

- official
- useful
- worth supporting
- but still optional for the core workflow contract

## Product recommendation

The recommended public stance is:

- use **`ldev` as the workflow layer**
- support both **`blade-workspace`** and **`ldev-native`**
- use **MCP** when it improves interoperability or shortens a generic portal action
- keep **`ldev`** as the preferred interface for local runtime workflows and opinionated discovery

See also:

- [AI Workflows](/ai-workflows)
- [MCP Demo Environment](/mcp-demo)
- [Support Matrix](/support-matrix)
