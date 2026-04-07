---
title: MCP Demo Environment
---

# MCP Demo Environment

Use this guide when you want a Liferay environment prepared to show what an
agent can do with:

- `ldev`
- MCP
- a broader-than-default OAuth2 scope profile

This is intentionally a demo and exploration profile, not the recommended
minimum production profile.

## Goal

The goal of this setup is:

- keep `ldev` core workflows working
- keep MCP OpenAPI discovery working
- unlock a wider set of admin/content/object actions for agent demos

For the default and minimal profile, see [OAuth2 Scopes](/oauth-scopes).

## Recommended demo setup

After first login and basic portal bootstrap:

```bash
ldev doctor --json
ldev context --json
ldev oauth install --scope-profile max-test --write-env
ldev mcp check --json
ldev mcp probe --json
ldev mcp openapis --json
```

Why `max-test`:

- it keeps the default `ldev` base profile
- it adds content authoring scopes
- it adds site-admin scopes
- it adds object-admin scopes

This is a good balance for demos because it expands MCP and agent reach without
requiring every possible API family in the portal.

## What `max-test` is for

`max-test` is the recommended profile when you want to demonstrate:

- portal discovery with `ldev`
- OpenAPI discovery with MCP
- content admin actions
- site admin actions
- object admin and headless object actions

It is not meant to be the default for normal onboarding.

## Suggested demo flow

Use this order in a demo:

1. Show `ldev doctor --json` and `ldev context --json` as the stable bootstrap.
2. Show `ldev mcp check --json` and `ldev mcp openapis --json` to prove MCP is alive.
3. Show one task-shaped `ldev` workflow such as `portal inventory page`.
4. Show one generic MCP-driven action against an API family discovered at runtime.
5. Show one safe write action with the demo OAuth2 profile.

This makes the distinction clear:

- `ldev` gives task-shaped workflows
- MCP gives generic discovery and endpoint execution

## Demo scenarios

These are the concrete scenarios that fit well in a live or recorded demo.

### 1. Discover the runtime and auth state

Goal:

- show that agents start from stable machine-readable context

Commands:

```bash
ldev doctor --json
ldev context --json
```

### 2. Discover all available OpenAPI families through MCP

Goal:

- show that the agent does not need to hardcode which API families exist

Commands:

```bash
ldev mcp check --json
ldev mcp openapis --json
```

### 3. Inspect a page with `ldev` before using MCP

Goal:

- show the product split: `ldev` first for task-shaped portal context

Commands:

```bash
ldev portal inventory sites --json
ldev portal inventory page --url /web/guest/home --json
```

### 4. Create or update a piece of structured content

Goal:

- show that the agent can use a higher-value authoring workflow

Suggested path:

- use `ldev resource ...` for the task-shaped operation
- use MCP to inspect the corresponding API family afterward

### 5. Create or modify content-admin data through MCP

Goal:

- show why `content-authoring` scopes matter

Examples:

- inspect `headless-admin-content`
- create or update categories, folders, or content-admin managed entities

### 6. Create or modify site-admin data through MCP

Goal:

- show why `site-admin` scopes matter

Examples:

- inspect `headless-admin-site`
- mutate site-level resources that are not part of the core `ldev` task-shaped workflow

### 7. Create or modify object definitions and object entries

Goal:

- show one of the highest-value agent scenarios

Examples:

- inspect `object-admin`
- inspect `headless-object`
- create or update an object definition and then work with its entries

This is one of the best reasons to use the broader demo profile.

### 8. Compare `ldev` and MCP in one end-to-end task

Goal:

- show that the two interfaces complement each other

Suggested flow:

1. resolve context with `ldev portal inventory ...`
2. discover APIs with `ldev mcp openapis --json`
3. execute a generic headless action through MCP
4. verify result again with `ldev`

## Example narrative for an agent demo

This is the simplest believable narrative:

1. The agent reads repo/runtime context with `ldev doctor` and `ldev context`.
2. The agent verifies MCP with `ldev mcp check`.
3. The agent discovers the available APIs with `ldev mcp openapis`.
4. The agent inspects a real page with `ldev portal inventory page`.
5. The agent uses MCP to discover the exact API family needed.
6. The agent performs a write action enabled by `--scope-profile max-test`.
7. The agent verifies the result with `ldev`.

That gives a balanced demo of:

- stable local workflow bootstrap
- official MCP interoperability
- broader OAuth2 access without using a human password

## Recommended talking points

- The default `ldev` OAuth2 profile stays intentionally small.
- `max-test` is for demos, experiments, and richer agent exploration.
- `ldev` is still the preferred layer for task-shaped discovery and local runtime workflows.
- MCP becomes much more useful once the agent has both:
  - runtime context from `ldev`
  - a broader OAuth2 scope profile

## Related docs

- [OAuth2 Scopes](/oauth-scopes)
- [MCP Strategy](/mcp-strategy)
- [MCP Liferay Capability Matrix](/mcp-liferay-capability-matrix)
- [AI Workflows](/ai-workflows)
- [API Surfaces](/api-surfaces)

[Back to Home](/)
