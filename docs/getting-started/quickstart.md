---
title: Quickstart
description: Install ldev, create a local environment, start it, and run the first checks.
---

# Quickstart

This is the shortest path to a usable local Liferay environment.

Choose the path that matches your project:

- `ldev-native`: `ldev` manages the local Docker runtime directly
- `Liferay Workspace`: `ldev` runs on top of a standard Blade workspace

## 1. Install

```bash
npm install -g @mordonezdev/ldev
ldev --help
```

Requirements:

- Node.js 20+
- Docker and `docker compose`
- Git

## 2. Initialize a project

### Option A: ldev-native

Create a fresh `ldev` project:

```bash
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
```

If you are already inside a repo that uses the `ldev` runtime layout, initialize the local environment files:

```bash
ldev env init
```

### Option B: existing Liferay Workspace

If your team uses the standard Blade workspace model, you can keep it and still use `ldev`:

```bash
npm install -g @mordonezdev/ldev
blade init ai-workspace
cd ai-workspace
ldev doctor
```

For an existing workspace, run `ldev` from the workspace root. `ldev` detects Blade workspaces and can still provide doctor, portal, resource, and AI bootstrap workflows on top of them.

## 3. Prepare local config

```bash
ldev setup
ldev doctor
```

Run `doctor` before the first start so you catch missing Docker, port conflicts, bad paths, or activation-key problems early.

## 4. Start the environment

```bash
ldev start --activation-key-file /path/to/activation-key.xml
```

If the activation key is already exported in your shell, this is enough:

```bash
ldev start
```

## 5. Check health

```bash
ldev status
ldev doctor
```

If the portal is up and you want API-based discovery, install OAuth once:

```bash
ldev oauth install --write-env
ldev portal check
```

`ldev` uses OAuth2 for portal discovery, resource operations, and other API-backed commands. `--write-env` writes the local credentials into `.liferay-cli.local.yml`.

See [OAuth](/core-concepts/oauth) for the model and [Configuration](/reference/configuration) for precedence.

## 6. Prepare the repo for agents

If you want coding agents to work through `ldev`, bootstrap the managed AI assets:

```bash
ldev ai install --target .
```

Optional overlays:

```bash
ldev ai install --target . --project-context
ldev ai install --target . --project --project-context
```

## 7. Start discovering the portal

```bash
ldev portal inventory sites
ldev portal inventory pages --site /global
ldev portal inventory page --url /home --json
```

Next:

- [First Incident](/getting-started/first-incident)
- [Explore a Portal](/workflows/explore-portal)
- [Liferay Workspace](/advanced/liferay-workspace)
