# First Run Walkthrough

This guide shows a realistic end-to-end `ldev` flow for a fresh DXP local environment.

It is intentionally longer than [Quickstart](/quickstart): the goal here is not minimality, but confidence. You see the order of commands, the kind of output each step prints, and what “healthy” looks like from the first scaffold to the final `stop`.

Use this when:

- you are onboarding a developer to `ldev`
- you want a realistic transcript to compare against your own machine
- you want one walkthrough that touches setup, OAuth, portal inspection, search, repo-backed resources, and AI bootstrap

If you only want the shortest path to a running environment, use [Quickstart](/quickstart).

## What this walkthrough covers

The flow below creates a new project, starts DXP, installs the OAuth2 apps that `ldev` uses for authenticated API workflows, inspects the default Guest site, exports a few resources into the repo, restarts the environment, and shuts it down cleanly.

High-level command flow:

```bash
ldev project init --name my-project --dir ~/projects/my-project --commit
cd ~/projects/my-project
ldev ai install --target .
ldev doctor
ldev setup
ldev start --activation-key-file /path/to/activation-key.xml
ldev oauth install --write-env
ldev oauth admin-unblock
ldev status
ldev portal check
ldev portal inventory sites --json
ldev portal page-layout export --url /web/guest/home --json
ldev portal search indices --json
ldev resource export-templates
ldev resource export-structures
ldev resource import-templates --apply
ldev resource import-structures --apply
ldev env restart
ldev stop
```

## Prerequisites

Before starting:

- install `ldev`
- make sure Docker is running
- have a valid DXP activation key XML file ready

Example activation key location:

```bash
export ACTIVATION_KEY=/path/to/activation-key-dxp.xml
```

## Use the demo script

To run the same walkthrough as a visible terminal transcript, use:

```bash
ACTIVATION_KEY=/path/to/activation-key-dxp.xml ./scripts/demo-first-run.sh
```

This script is separate from the smoke tests on purpose:

- it keeps command output visible
- it is designed for documentation and onboarding
- it is easier to copy from when you want example output snippets

The technical smoke test remains:

```bash
ACTIVATION_KEY=/path/to/activation-key-dxp.xml npm run smoke:solo
```

The smoke test is optimized for verification, not for human-readable transcripts.

## Step-by-step walkthrough

### 1. Create the project

```bash
ldev project init --name my-project --dir ~/projects/my-project --commit
cd ~/projects/my-project
```

What to expect:

- `docker/` with compose files and `.env`
- `liferay/` with configs, build output locations, and repo-backed resource directories
- an initial git commit if you used `--commit`

Representative output:

```text
Project ready in: /path/to/my-project
Git repository: initialized
Git commit: created
```

### 2. Install reusable AI assets

```bash
ldev ai install --target .
```

What this adds:

- `AGENTS.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- vendor-managed skills in `.agents/skills/`

Representative output:

```text
Installation completed in: /private/tmp/ldev-demo-30209/ldev-demo

Skills instaladas: 6
AGENTS.md: installed
CLAUDE.md: installed
.github/copilot-instructions.md: installed
```

### 3. Validate the host and prepare the environment

```bash
ldev doctor
ldev setup
```

What this does:

- checks Docker, compose, repo structure, and local configuration
- creates or updates `docker/.env`
- prepares data directories
- persists the selected compose profile

Representative output:

```text
Doctor: OK (14 pass, 2 warn, 0 fail)
...
Environment prepared at /private/tmp/ldev-demo-30209/ldev-demo/docker/.env
Data root: /private/tmp/ldev-demo-30209/ldev-demo/docker/data/default
Docker pull: skipped
Profile: DXP only (embedded)
```

### 4. Start DXP

```bash
ldev start --activation-key-file "$ACTIVATION_KEY"
```

What to expect:

- Docker services start
- the activation key is copied into the right config directory
- `ldev` waits until the portal is healthy

Representative output:

```text
Environment started from /private/tmp/ldev-demo-30209/ldev-demo/docker
Portal URL: http://127.0.0.1:8081
Activation key: /private/tmp/ldev-demo-30209/ldev-demo/liferay/configs/dockerenv/osgi/modules/activation-key-....xml
Health wait: yes
```

### 5. Install the OAuth2 apps used by `ldev`

```bash
ldev oauth install --write-env
ldev oauth admin-unblock
```

Why these two commands matter:

- `oauth install --write-env` creates the OAuth2 apps that power authenticated `portal` and `resource` commands
- `oauth admin-unblock` clears the initial admin password-reset gate in a fresh portal so authenticated commands stop returning `403`

Representative output:

```text
OAuth2 app installed via ldev:oauthInstall
Company: 91244089858519 (liferay.com)
User: 20131 (test@liferay.com)
LIFERAY_CLI_OAUTH2_CLIENT_ID=ldev-1eb367bef3d4
LIFERAY_CLI_OAUTH2_CLIENT_SECRET=secret-0e0a6338-65d0-49c1-a48b-a57455a6a9bf
.liferay-cli.local.yml actualizado: /private/tmp/ldev-demo-30209/ldev-demo/.liferay-cli.local.yml
```

```text
Admin user unblocked via ldev:adminUnblock
passwordReset=false
```

## Useful checks after the first start

### Environment status

```bash
ldev status
ldev portal check
ldev portal auth token
ldev context --json
```

These confirm:

- containers are running
- the portal health endpoint is reachable
- OAuth token generation works
- `ldev` has the expected local project context

Representative output:

```text
HEALTH_OK
baseUrl=http://localhost:8081
clientId=ldev-1eb367bef3d4
checkedPath=/api/jsonws/company/get-companies
status=200
tokenType=Bearer
expiresIn=600
```

### Inspect the default Guest site

```bash
ldev portal inventory sites --json
ldev portal page-layout export --url /web/guest/home --json
```

This is a good first taste of why `ldev` exists:

- you can list accessible sites quickly
- export a normalized content-page view for diffing or analysis

Representative output:

```text
[
  {
    "groupId": "20126",
    "siteFriendlyUrl": "/guest",
    "name": "Guest",
    "pagesCommand": "inventory pages --site /guest"
  }
]
```

### Inspect search

```bash
ldev portal search indices --json
ldev portal search mappings --index liferay-0 --json
```

On the default profile, these commands talk to the internal Elasticsearch sidecar inside the `liferay` container.

Representative output:

```text
{
  "ok": true,
  "esUrl": "http://127.0.0.1:9201 (inside liferay)",
  "rows": [
    {
      "health": "green",
      "status": "open",
      "index": "liferay-25321648551395",
      "docs.count": "410"
    },
    {
      "health": "green",
      "status": "open",
      "index": "liferay-0",
      "docs.count": "0"
    }
  ]
}
```

### Export and re-import a few repo-backed resources

```bash
ldev resource export-templates
ldev resource export-structures
ldev resource import-templates --apply
ldev resource import-structures --apply
```

This shows the repo-backed content workflow:

- export from portal into the repository
- review files in `liferay/resources/...`
- apply them back to the portal

Representative output:

```text
EXPORTED site=/global exported=1 failed=0 dir=/private/tmp/ldev-demo-39227/ldev-demo/liferay/resources/journal/templates/global
```

## Finish cleanly

```bash
ldev env restart
ldev stop
```

Use `env restart` when you want a full container restart while staying inside the same repo and state directory. Use `stop` when you are done for the day.

Representative output:

```text
Waiting for Liferay to become ready: ok
Liferay container restarted
Portal URL: http://127.0.0.1:8081
Health wait: yes
```

## What success looks like

At the end of a healthy first run, you should have:

- a working local DXP reachable in the browser
- `docker/.env` populated with `LIFERAY_CLI_OAUTH2_CLIENT_ID` and `...SECRET`
- AI bootstrap files such as `AGENTS.md` and `.agents/skills/`
- exported structures/templates under `liferay/resources/`
- successful responses from `portal check`, `portal inventory`, and `portal search`

## Notes

- `Quickstart` remains the shortest route to a running environment.
- This walkthrough is the better document to share in onboarding sessions or internal team docs.
- The exact IDs and secrets in your output will differ from the examples above.
- Some advanced commands can still show transient startup-related differences on a fresh portal. Prefer the command flow and the general shape of the output over exact literal matches.
