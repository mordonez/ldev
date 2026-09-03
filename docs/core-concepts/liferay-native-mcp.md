---
title: Liferay's Native MCP Server
description: What Liferay DXP's built-in MCP server actually is, how to turn it on, and why it does not replace or overlap with ldev.
---

# Liferay's Native MCP Server

Liferay DXP 2026.Q3 ships an MCP (Model Context Protocol) server built into
the portal itself, at [Release feature status](https://learn.liferay.com/w/dxp/ai/using-liferay-as-an-mcp-server).
This page documents what it is, exactly how to turn it on for local testing,
and — because `ldev` [removed its own MCP server](/adr/0008-remove-mcp-server)
in June 2026 — why the two are not in competition.

Everything here was verified hands-on against a real DXP 2026.Q3.1 instance
bootstrapped with `ldev`, not just read from docs.

## What it actually is

`/o/mcp` is a live wrapper around Liferay's Headless REST APIs, reachable by
any MCP-speaking client (Claude Desktop, Cursor, GitHub Copilot, Gemini CLI,
the official MCP Inspector). It lets an AI agent read and write **content in
a running portal** — sites, users, web content, accounts — with the
permissions of whichever Liferay user the request authenticates as.

It is not a scriptable batch/file tool, has no concept of local resource
files, migrations, or diffs, and has nothing to do with the Docker
environment, OSGi, deploy, or git worktrees. It is purely a runtime API
surface for a portal that is already up.

### Tool shape: 4 meta-tools, not one per endpoint

The interesting design choice: `tools/list` on `/o/mcp` does not return one
MCP tool per Headless REST operation (there are thousands across all
Headless apps). It returns exactly **4 meta-tools** that progressively
discover and invoke the real surface:

| Tool | Purpose |
|---|---|
| `getToolSetsPage` | List every "tool-set" — one per Headless REST app (`headless-admin-user-v1.0`, `headless-delivery-v1.0`, `data-engine-v2.0`, ...). Mirrors `ldev portal api discover`'s app list almost 1:1. |
| `getToolSetToolSetNameToolSummariesPage` | List the tools (REST operations) inside one tool-set, e.g. `getRole`, `putRoleBatch`, `getUserAccountEmailAddressesPage`. |
| `getToolSetToolSetNameTool` | Fetch one tool's input schema before invoking it. |
| `postToolSetToolSetNameToolInvoke` | Actually invoke a tool, given `{toolSetName, toolName, body}`. |

This keeps the initial context load small (4 schemas) regardless of how many
Headless operations exist underneath, at the cost of extra round trips to
discover and invoke anything. Each real "tool" underneath is a 1:1 mapping
to a single Headless REST operation — same granularity as reading the raw
OpenAPI spec, no curation or batching on top.

## Enabling it for local testing

The two release feature flags gate different things:

- `LPD-63311` — the MCP server itself. Without it, `/o/mcp` doesn't exist
  and the *MCP Server* entry doesn't appear in Instance Settings at all.
- `LPD-63415` (RFC 8414 Authorization Server Metadata) — only needed for
  OAuth 2.0 client auto-discovery (`resource_metadata`). Not required for
  Basic auth or a manually-configured OAuth client.

Despite the official docs only showing the Control Panel toggle for
"Release" flags, they work as portal properties too — no browser required:

```bash
ldev portal config set "feature.flag.LPD-63311" --value true
ldev portal config set "feature.flag.LPD-63415" --value true
ldev env restart --timeout 300   # or ldev start again; the flags need a fresh JVM
```

The *MCP Server* enabled toggle itself is different: it's a
**company-scoped OSGi factory configuration**
(`com.liferay.mcp.server.rest.internal.configuration.MCPServerConfiguration`,
persisted as `...MCPServerConfiguration.scoped~<company-uuid>`), not a plain
portal property. There is currently no known file-drop or CLI shortcut for
it — enable it once through the UI:

1. Sign in as an admin.
2. _Control Panel_ → _Instance Settings_ → _Platform_ → _MCP Server_.
3. Check _Enabled_ → _Save_.

Confirm it's live: `curl -i http://localhost:PORT/o/mcp` goes from `404`
(disabled) to `401` with a `WWW-Authenticate` header (enabled, needs auth).

## Authenticating against it

Two schemes are accepted, and they behave differently in practice:

- **HTTP Basic** with a real Liferay user's own email/password
  (`admin@liferay.com:test` on a fresh `ldev`-bootstrapped instance) —
  works immediately, no extra setup.
- **OAuth 2.0 Bearer** — Liferay's MCP server validates the token itself and
  rejects any token whose audience doesn't include the MCP resource URI
  (`<baseUrl>/o/mcp`). A plain client-credentials token from
  `ldev oauth install` does **not** work against `/o/mcp` out of the box —
  it comes back `401 invalid_token: "Access token is not bound to this MCP
  server"`. A client must explicitly request that `resource` when getting
  the token; `ldev`'s OAuth client does not do this today, since the OAuth
  app `ldev` provisions is for Headless REST directly, not for `/o/mcp`.

## Why this doesn't replace anything in `ldev`

[ADR 0008](/adr/0008-remove-mcp-server) removed `ldev`'s own MCP server in
June 2026 — before this Liferay feature existed — on the grounds that a
CLI + skills already covered agent integration better than a stdio MCP
server for a CLI-shaped tool. Liferay now shipping a native MCP server
validates that call rather than reopening it: it means AI agents get a
supported, first-party way to touch **live portal content** without any
tool needing to build or maintain that bridge itself.

The two surfaces don't overlap:

| | Liferay's `/o/mcp` | `ldev` |
|---|---|---|
| Talks to | A running portal instance | Docker, git, the local filesystem, *and* the portal's APIs |
| Unit of work | One REST call at a time, ad hoc | File-based, batchable workflows (export/import/migrate a whole site's structures) |
| Environment lifecycle (start/stop/doctor/deploy/worktrees) | No concept of this | Its actual reason to exist |
| Local resource files, diffs, migration descriptors | No | Yes — `resource export-*` / `import-*` / `migration-pipeline` |
| Auth model | Per-MCP-client OAuth or Basic, user-scoped | Long-lived local OAuth app for scripted/CI use |

If an agent needs to poke at a couple of live records interactively in a
running portal, `/o/mcp` is a reasonable way to do it. Anything involving
the local environment itself, or moving structured content between
environments as files, stays `ldev`'s job.
