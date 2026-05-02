---
title: Quickstart
description: Install ldev and either bootstrap a local Liferay environment or attach ldev to an existing one.
---

# Quickstart

The shortest path from zero to a working `ldev` setup.

There are two starting points:

- **A. Bootstrap a fresh local environment** — `ldev-native`, fully managed by
  ldev in Docker.
- **B. Attach to an existing Liferay Workspace** — keep your Blade workspace,
  add `ldev` on top.

Pick the one that matches your situation.

## 1. Install

```bash
npm install -g @mordonezdev/ldev
ldev --help
```

Requirements:

- Node.js 22+ (24 recommended)
- Docker and `docker compose`
- Git
- [LCP CLI](https://learn.liferay.com/w/dxp/cloud/reference/command-line-tool)
  — only if you plan to pull data from Liferay Cloud
- [playwright-cli](https://github.com/microsoft/playwright-cli) — only if
  agents in your project run UI verification

## 2A. Bootstrap a fresh local environment (`ldev-native`)

Create the project scaffold:

```bash
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
```

If you are already inside a repo that uses the `ldev` runtime layout, skip
`project init` and run `ldev env init` to write the local environment files.

## 2B. Attach to an existing Liferay Workspace

```bash
npm install -g @mordonezdev/ldev
blade init my-workspace
cd my-workspace
ldev doctor
```

`ldev` detects the Blade workspace and provides doctor, portal, resource and
agent workflows on top of it. Your existing Liferay layout is not modified.

## 3. Prepare and start

```bash
ldev setup
ldev doctor
ldev start --activation-key-file /path/to/activation-key.xml
```

`doctor` catches missing Docker, port conflicts, bad paths and activation-key
problems before the first start. If your activation key is already exported in
your shell, `ldev start` is enough.

## 4. Check health

```bash
ldev status
ldev doctor
```

## 5. Install OAuth (once)

Most `ldev` commands talk to Liferay over OAuth2. Install it once:

```bash
ldev oauth install --write-env
ldev portal check
```

`--write-env` writes the local credentials to `.liferay-cli.local.yml`.

See [OAuth](/core-concepts/oauth) for the full model and remote setup options.

## 6. Get the consolidated portal context

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
```

`portal inventory` is `ldev`'s context-aggregation surface: each call returns
a structured snapshot that would otherwise take several Headless API calls.
Use it as the first thing you run after a fresh start.

## 7. Optional: prepare the repo for AI agents

If your team uses MCP-capable editors:

```bash
ldev ai install --target .
ldev ai mcp-setup --target . --tool all
```

This installs the standard agent assets (`AGENTS.md`, vendor skills, rule
directories for Claude/Cursor/VSCode/etc.) and registers the `ldev` MCP server
in the editors' MCP config.

Optional overlays:

```bash
ldev ai install --target . --project --project-context
```

## 8. Working from a worktree

When you need to run a read-only command against the main checkout while your
shell is inside a worktree, target it explicitly:

```bash
ldev --repo-root ../.. portal inventory sites --json
ldev --repo-root ../.. ai bootstrap --intent=develop --json
```

## Where to go next

- [Export and Import Resources](/workflows/export-import-resources) — the
  workflow that makes ldev different.
- [Resource Migration Pipeline](/workflows/resource-migration-pipeline) — for
  structure changes against existing content.
- [Worktrees](/advanced/worktrees) — branch-isolated runtimes.
- [Agents and MCP](/agentic/) — once you have `ai install` and `mcp-setup`
  done.
