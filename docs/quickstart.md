---
title: Quickstart
description: Minimal setup guide to get ldev running with Docker Compose or within a standard Liferay Workspace.
---

# Quickstart

Get up and running with `ldev` in minutes. Choose the path that best fits your current environment.

## Choose your path

- **[Docker runtime](#docker-runtime)** — unlock the full potential of `ldev` with Docker Compose. Recommended for new projects.
- **[Standard Liferay Workspace](#standard-liferay-workspace)** — integrate `ldev` into an existing Blade workspace. Recommended for teams already using Blade.

::: info
If you want the shortest possible setup, follow only the first command block in your selected path.
:::

## Docker runtime

Full local runtime with isolated environments, worktrees, and deploy cache.

```bash
npm install -g @mordonezdev/ldev
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev setup
ldev start
ldev oauth install --write-env
ldev oauth admin-unblock
```

### Main Workflows

Once your project is running, you can use these main workflows:

```bash
# Run diagnostics
ldev doctor --json

# Get current repo and runtime context
ldev context --json

# Explore portal pages
ldev portal inventory page --url /web/guest/home --json
```

---

## Standard Liferay Workspace

Add `ldev` on top of an existing Blade Workspace.

### Prerequisites

::: warning DXP Activation Key
Liferay DXP requires a valid license before the portal will start.
Get your key from the [Liferay Customer Portal](https://customer.liferay.com) and note the path.
:::

### Setup

```bash
npm install -g @mordonezdev/ldev
blade init ai-workspace
cd ai-workspace
ldev doctor
```

`ldev doctor` tells you what is configured and what is missing. Verify the output shows no `[FAIL]` entries before continuing.

### Start the portal

```bash
ldev start --activation-key-file /path/to/activation-key-dxp-*.xml
```

::: tip Environment Variable
You can set `LDEV_ACTIVATION_KEY_FILE` in your shell profile so you don't need to pass it every time:
```bash
export LDEV_ACTIVATION_KEY_FILE=/path/to/activation-key-dxp-*.xml
```
:::

### First login

The portal starts with a default admin account. You must complete the setup wizard before any `ldev` portal commands will work:

1. Open `http://localhost:8080`
2. Log in as `test@liferay.com` with password `test`
3. Accept the Terms of Use
4. Set a new password when prompted

::: danger Password Change
After changing your password, the default `test` credentials no longer work.
Use your new password in all subsequent steps.
:::

### Configure OAuth2

`ldev` uses OAuth2 for portal commands. Run this once after your first login:

```bash
ldev oauth install --write-env
```

This registers an OAuth2 application in the portal and writes the credentials to your local configuration.

---

## AI bootstrap (both project types)

Prepare your project for AI agents.

```bash
ldev ai install --target .
```

Options:
- `--project-context`: Use when the repo will keep `docs/ai/project-context.md` maintained.
- `--project`: Use for optional project-owned AI overlay on top of the vendor-managed base.

## Next steps

- [First Run Walkthrough](/first-run-walkthrough) — see expected output for every command.
- [Commands](/commands) — full CLI reference.
- [Support Matrix](/support-matrix) — platform and Docker provider support.
