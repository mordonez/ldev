# ldev

[![npm version](https://img.shields.io/npm/v/@mordonezdev/ldev.svg)](https://www.npmjs.com/package/@mordonezdev/ldev)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

`ldev` is the recommended workflow CLI for Liferay.

It gives humans and coding agents short commands, stable JSON output, and direct workflows for local runtime work, portal discovery, OAuth bootstrap, and MCP diagnostics.

## Quickstart

Full local runtime with isolated environments, worktrees, and deploy cache.

```bash
npm i -g @mordonezdev/ldev
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev setup
ldev start
ldev oauth install --write-env
ldev oauth admin-unblock
ldev portal inventory page --url /web/guest/home --json
```

This workflow also works in standard [Liferay Workspaces](https://learn.liferay.com/w/dxp/development/tooling/liferay-workspace) and [AI Workspaces](https://learn.liferay.com/w/dxp/development/tooling/liferay-workspace/ai-tools-in-workspace)

## Agent-first commands

Once the portal is running and OAuth is configured:

```bash
ldev ai install --target .
ldev doctor --json
ldev context --json
ldev portal inventory sites --json
ldev portal inventory page --url /web/guest/home --json
ldev logs diagnose --json
ldev mcp check --json
```

## Main capabilities

- Runtime diagnostics with `ldev doctor`
- Stable project/runtime snapshot with `ldev context --json`
- Portal discovery with `ldev portal inventory ...`
- OAuth bootstrap with `ldev oauth install`
- MCP diagnostics with `ldev mcp check`, `probe`, and `openapis`
- Resource export, import, and migration workflows
- AI and agent bootstrap with `ldev ai install`

## Docs

- [Quickstart](https://mordonez.github.io/ldev/quickstart)
- [Command Reference](https://mordonez.github.io/ldev/commands)
- [Portal Inventory](https://mordonez.github.io/ldev/portal-inventory)
- [AI Workflows](https://mordonez.github.io/ldev/ai-workflows)
- [MCP Strategy](https://mordonez.github.io/ldev/mcp-strategy)
- [Product Compatibility](https://mordonez.github.io/ldev/product-compatibility)

## Contribute

```bash
git clone git@github.com:mordonez/ldev.git
cd ldev
npm install
npm link
npm run build:watch
```

To explore the CLI without installing:

```bash
npx @mordonezdev/ldev --help
```
