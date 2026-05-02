<p align="center">
  <img src="docs/public/logo.svg" alt="ldev logo" width="120" height="120">
</p>

# ldev

[![npm version](https://img.shields.io/npm/v/@mordonezdev/ldev.svg)](https://www.npmjs.com/package/@mordonezdev/ldev)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22%20(recommended%2024)-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Liferay, scriptable.**

`ldev` turns Liferay operations that today only live in the admin UI —
importing structures, exporting templates, migrating content between models,
bootstrapping environments — into commands with structured output. For your
terminal, your scripts, and your AI agents.

```bash
npm install -g @mordonezdev/ldev
```

---

## The problem ldev solves

Working with Liferay in 2026 still means doing a lot of work by hand:

- importing and exporting structures, templates, ADTs and fragments lives in the
  admin UI
- there is no native pipeline for migrating articles when a structure changes
- standing up a clean local environment from a Liferay Cloud (LCP) backup is a
  manual sequence
- the Headless API surface is wide but uneven; some operations exist only as
  legacy JSONWS, some only in the UI
- AI agents cannot click — so without a CLI, they cannot really operate Liferay

`ldev` fills those gaps. It is a focused CLI for the Liferay work that Liferay
itself does not expose cleanly as commands or APIs.

## A systems problem, not an AI problem

The same friction that slows down a developer working on Liferay — UI-only
operations, shared mutable runtimes, no migration path, human-readable output
— is also what stops an AI agent from doing real work on it. Different
consumer, same wall.

`ldev` cleans up that surface with classic developer-experience moves:
reproducible environments, isolated runtimes per branch, guardrails before
mutation, operations as data, and structured output everywhere. Each of those
is worth doing for humans on its own. The agent integration is a consequence
of having done them, not a separate product.

That is why this CLI is also an MCP server — not because we built AI
features, but because the surface was already clean.

For the long version, see [Why ldev Exists](https://mordonez.github.io/ldev/core-concepts/why-ldev-exists).

## What it actually covers

These are the parts where `ldev` is genuinely doing something Liferay does not
do for you:

- **Resource ops as files** — `resource export-*`, `import-*`, with
  `--check-only` previews and read-after-write verification, for structures,
  templates, ADTs and fragments. UI-only operations turned into reviewable
  files.
- **Structure migration** — `resource migration-init` + `migration-pipeline`,
  the workflow Liferay does not have for migrating articles when a journal
  structure changes.
- **One-pass portal context** — `portal inventory sites|pages|page|structures`
  consolidates several Headless API calls into a single structured response, so
  a developer or an agent can grab "what is in this portal" in one shot.
- **Local environments from zero** — `project init`, `setup`, `start` scaffold
  a working Docker-based Liferay runtime without manual Compose plumbing.
- **Branch-isolated runtimes** — `worktree setup --with-env` gives each branch
  its own Postgres, Liferay and OSGi state. On Linux + Btrfs, snapshots make
  branch swaps near-instant.
- **OAuth in one command** — `oauth install --write-env` deploys the installer
  bundle, creates the OAuth app via Gogo, verifies the token and writes
  credentials locally.
- **An MCP server with 15 tools** — the same workflows exposed to MCP-capable
  editors, so agents can run them without a custom integration.

`ldev` also includes convenience wrappers — `logs diagnose` groups exceptions
from recent Docker Compose logs by regex, `doctor` runs environment readiness
checks, `osgi status|diag` wraps Gogo Shell. They are useful, but they are not
the headline.

## Honest limits

A few things to know up front:

- `ldev db sync` works against **Liferay Cloud (LCP)**. For self-hosted, use
  `ldev db import --file <backup>` with a backup you already have.
- `ldev logs diagnose` groups exceptions and applies a small set of keyword
  rules — it speeds up triage, it does not do root-cause analysis.
- Btrfs snapshots for worktrees are Linux-only. macOS and Windows fall back to
  full directory clones.

## Quick install

```bash
npm install -g @mordonezdev/ldev
ldev --help
```

Requirements: Node.js 22+ (24 recommended), Docker + `docker compose`, Git. For
LCP-backed flows, [LCP CLI](https://learn.liferay.com/w/dxp/cloud/reference/command-line-tool).

To stand up a fresh local environment:

```bash
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev setup
ldev start
ldev oauth install --write-env
```

To use it on top of an existing Liferay Workspace, just run `ldev` from the
workspace root — it detects Blade workspaces and adapts.

## Who it is for

- Liferay developers who want to script the parts of the platform that today
  require clicks.
- Support and ops teams who need fast, repeatable inspection of running
  portals.
- Consultants and architects who audit customer portals and need structured
  evidence.
- Teams running AI agents that need a real execution layer on top of Liferay.

## Agents and MCP

Because every workflow has structured output, exposing `ldev` to an agent is
free: the same operations are available as MCP tools. Today, without a CLI like
this, an AI agent cannot meaningfully operate Liferay — too much of the
platform lives behind the admin UI. With `ldev`, an agent can stand up an
environment, import a structure, run a migration check, deploy a module and
verify the result.

```bash
ldev ai install --target .
ldev ai mcp-setup --target . --tool all
```

The CLI is always the canonical path; MCP is acceleration on top of it.

## Documentation

Full docs: **[mordonez.github.io/ldev](https://mordonez.github.io/ldev/)**

- [What is ldev](https://mordonez.github.io/ldev/getting-started/what-is-ldev)
- [Quickstart](https://mordonez.github.io/ldev/getting-started/quickstart)
- [Resource workflows](https://mordonez.github.io/ldev/workflows/export-import-resources)
- [Structure migration](https://mordonez.github.io/ldev/workflows/resource-migration-pipeline)
- [Worktrees](https://mordonez.github.io/ldev/advanced/worktrees)
- [Agents and MCP](https://mordonez.github.io/ldev/agentic/)
- [Command reference](https://mordonez.github.io/ldev/commands/)

## Contributing

```bash
git clone git@github.com:mordonez/ldev.git
cd ldev
npm install
npm run build:watch
npm link
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and test taxonomy.

## License

Released under the [Apache-2.0 License](LICENSE).
