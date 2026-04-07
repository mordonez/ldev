# ldev

[![npm version](https://img.shields.io/npm/v/@mordonezdev/ldev.svg)](https://www.npmjs.com/package/@mordonezdev/ldev)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Agentic CLI for Liferay development and automation.**

---

`ldev` is the recommended workflow CLI for Liferay. It provides specialized commands for local runtime management, portal discovery, OAuth bootstrap, and MCP diagnostics, making Liferay development predictable and agent-friendly.

## 🚀 Quickstart

Install the CLI globally and initialize your first project.

```bash
npm install -g @mordonezdev/ldev
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev setup
ldev start
ldev oauth install --write-env
```

## ✨ Main Capabilities

- **Smart Diagnostics** — `ldev doctor` identifies misconfigurations in your Liferay environment.
- **Agent Context** — `ldev context --json` provides a stable snapshot for AI agents.
- **Portal Discovery** — `ldev portal inventory` explores sites, pages, and structures.
- **OAuth2 Management** — `ldev oauth install` handles complex OAuth2 registrations.
- **Advanced Workflows** — Resource migration, isolated worktree environments, and more.

## 🤖 Agent-First Commands

Once your portal is running and OAuth is configured, `ldev` provides high-signal output for coding agents:

```bash
ldev ai install --target .
ldev doctor --json
ldev context --json
ldev portal inventory sites --json
ldev logs diagnose --json
ldev mcp check --json
```

## 📚 Documentation

Visit the full documentation site: **[mordonez.github.io/ldev](https://mordonez.github.io/ldev/)**

- [Installation Guide](https://mordonez.github.io/ldev/install)
- [Quickstart](https://mordonez.github.io/ldev/quickstart)
- [Command Reference](https://mordonez.github.io/ldev/commands)
- [AI Integration](https://mordonez.github.io/ldev/ai-integration)
- [Troubleshooting](https://mordonez.github.io/ldev/troubleshooting)

## 🛠️ Development

```bash
git clone git@github.com:mordonez/ldev.git
cd ldev
npm install
npm run build:watch
npm link
```

To explore without installing:

```bash
npx @mordonezdev/ldev --help
```

## 📄 License

Released under the **[Apache-2.0 License](LICENSE)**.
