# Quickstart

## Choose your path

- Use [Docker runtime](#docker-runtime) to unlock the full potential of `ldev` with Docker Compose.
- Use [Standard Liferay Workspace](#standard-liferay-workspace) to integrate `ldev` into an existing Blade workspace.

If you want the shortest possible setup, follow only the first command block in your selected path.

## Docker runtime

Full local runtime with isolated environments, worktrees, and deploy cache.

```bash
npm install -g @mordonez/ldev
ldev project init --name my-project --dir ~/projects/my-project
cd ~/projects/my-project
ldev setup
ldev start
ldev oauth install --write-env
ldev oauth admin-unblock
```

Then start using the main workflows:

```bash
ldev doctor --json
ldev context --json
ldev portal inventory page --url /web/guest/home --json
```

## Standard Liferay Workspace

Add `ldev` on top of an existing Blade Workspace.

### Prerequisites

**DXP activation key** — Liferay DXP requires a valid license before the portal will start.
Get your key from the [Liferay Customer Portal](https://customer.liferay.com) and note the path.

### Setup

```bash
npm install -g @mordonez/ldev
blade init ai-workspace
cd ai-workspace
ldev doctor
```

`ldev doctor` tells you what is configured and what is missing. Verify the output shows no `[FAIL]` entries before continuing.

### Start the portal

```bash
ldev start --activation-key-file /path/to/activation-key-dxp-*.xml
```

Or set the environment variable so you don't need to pass it every time:

```bash
export LDEV_ACTIVATION_KEY_FILE=/path/to/activation-key-dxp-*.xml
ldev start
```

### First login

The portal starts with a default admin account. You must complete the setup wizard before any `ldev` portal commands will work:

1. Open `http://localhost:8080`
2. Log in as `test@liferay.com` with password `test`
3. Accept the Terms of Use
4. Set a new password when prompted

> After changing your password, the default `test` credentials no longer work.
> Use your new password in all subsequent steps.

### Configure OAuth2

`ldev` uses OAuth2 for portal commands (`portal inventory`, `resource`, `mcp`, etc.).
Run this once after the first login:

```bash
ldev oauth install --write-env
```

This registers an OAuth2 application in the portal and writes the credentials to your local config.
If prompted for a password, use the one you set during first login.

The installed app uses the default `ldev` scope profile: enough for `portal`,
`resource`, and MCP OpenAPI discovery without granting every admin scope by
default. See [OAuth2 Scopes](/oauth-scopes) if you need to extend that profile.

### Deploy and verify

```bash
ldev deploy all
ldev doctor --json
ldev context --json
ldev portal inventory sites --json
```

## AI bootstrap (both project types)

```bash
ldev ai install --target .
ldev ai install --target . --project-context
ldev ai install --target . --project
```

Use `--project-context` only when the repo will keep `docs/ai/project-context.md` maintained.
Use `--project` when you want the optional project-owned AI overlay on top of the vendor-managed base.

## Next docs

- [First Run Walkthrough](/first-run-walkthrough) — see expected output for every command in a realistic session
- [Commands](/commands) — full reference with fast navigation
- [Portal Inventory](/portal-inventory) — deep dive into site and page discovery
- [Support Matrix](/support-matrix) — platform and Docker provider support
