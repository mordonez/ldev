<p align="center">
  <img src="docs/public/logo.svg" alt="ldev logo" width="120" height="120">
</p>

# ldev

[![npm version](https://img.shields.io/npm/v/@mordonezdev/ldev.svg)](https://www.npmjs.com/package/@mordonezdev/ldev)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22%20(recommended%2024)-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Operational CLI for diagnosing, reproducing, and fixing Liferay environments.**

---

`ldev` is an operational CLI for Liferay maintenance work. It helps you inspect the portal, diagnose failures, reproduce production issues locally, apply fixes safely, and verify the result without depending on the UI.

## 🚀 Quickstart

Install the CLI, initialize a local project, and run the first checks.

```bash
npm install -g @mordonezdev/ldev
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev setup
ldev start
ldev doctor
```

## ✨ Main Capabilities

- **Understand the Environment** — `ldev context`, `ldev status`, and `ldev portal inventory` expose the actual runtime and portal state.
- **Diagnose Faster** — `ldev doctor` and `ldev logs diagnose` help isolate environment and runtime failures quickly.
- **Reproduce Production Locally** — Docker, database, and worktree workflows help bring real issues into a controlled local setup.
- **Apply Fixes Safely** — `ldev deploy`, `ldev osgi`, and related tooling support controlled runtime changes and verification.
- **Work with Structured Output** — JSON output makes the same workflows usable for humans, scripts, and coding agents.

## 🧭 Typical Incident Flow

Use `ldev` in the same order you would handle a real Liferay issue:

```bash
ldev context --json
ldev doctor --json
ldev logs diagnose --json
ldev oauth install --write-env
ldev portal check
ldev portal inventory page --url /home --json
ldev osgi diag com.acme.foo.web
ldev deploy module foo-web
```

## 🤖 Agent Workflows

Agents are a layer on top of the operational CLI, not the product story. Once the repo and environment are ready, `ldev` can bootstrap agent-facing assets such as `AGENTS.md`, `CLAUDE.md`, and managed skills while providing stable machine-readable workflows:

```bash
ldev ai install --target .
ldev ai bootstrap --intent=develop --json
ldev portal inventory sites --json
ldev logs diagnose --json
```

## 📚 Documentation

Visit the full documentation site: **[mordonez.github.io/ldev](https://mordonez.github.io/ldev/)**

- [Introduction](https://mordonez.github.io/ldev/getting-started/introduction)
- [Quickstart](https://mordonez.github.io/ldev/getting-started/quickstart)
- [First Incident](https://mordonez.github.io/ldev/getting-started/first-incident)
- [Command Reference](https://mordonez.github.io/ldev/commands/)
- [Agent Workflows](https://mordonez.github.io/ldev/agentic/)
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
