---
title: Command Reference
---

> **Tip:** Every command has `--help`. When in doubt: `ldev <command> --help`.

## Read This Page Fast

If you only need the safest daily flow, use this order:

1. [ldev doctor](#ldev-doctor)
2. [ldev context](#ldev-context)
3. [ldev start](#ldev-start)
4. [ldev oauth install](#ldev-oauth-install)
5. [ldev portal check](#ldev-portal-check)
6. [ldev portal inventory page](#ldev-portal-inventory-page)

If something fails, jump to [ldev logs diagnose](#ldev-logs-diagnose) and then [Troubleshooting](/troubleshooting).

`ldev` does not market every visible command as equally central. This page lists the full CLI, but the strongest public onboarding contract is:

- [`doctor`](#ldev-doctor)
- [`context`](#ldev-context)
- [`status`](#ldev-status)
- [`portal audit`](#ldev-portal-audit), [`portal inventory`](#ldev-portal-inventory-sites)
- [`logs diagnose`](#ldev-logs-diagnose)
- [`oauth install`](#ldev-oauth-install)
- [`mcp check`](#ldev-mcp)
- [`start`](#ldev-start), [`stop`](#ldev-stop), [`status`](#ldev-status), [`logs`](#ldev-logs)
- [`project init`](#ldev-project-init) for `ldev-native`
- [`portal check`](#ldev-portal-check), [`portal auth token`](#ldev-portal-auth-token)
- [`mcp probe`](#ldev-mcp)

Everything else on this page should currently be read as advanced or specialized tooling unless a guide says otherwise.

## Command Navigator

Use this section as a quick jump map.

### Daily commands

- [ldev doctor](#ldev-doctor)
- [ldev context](#ldev-context)
- [ldev setup](#ldev-setup)
- [ldev start](#ldev-start)
- [ldev oauth install](#ldev-oauth-install)
- [ldev stop](#ldev-stop)
- [ldev status](#ldev-status)
- [ldev logs](#ldev-logs)
- [ldev logs diagnose](#ldev-logs-diagnose)
- [ldev shell](#ldev-shell)
- [ldev mcp](#ldev-mcp)

### Project commands

- [ldev project init](#ldev-project-init)

### Portal commands

- [ldev portal check](#ldev-portal-check)
- [ldev portal auth token](#ldev-portal-auth-token)
- [ldev portal config get](#ldev-portal-config-get)
- [ldev portal config set](#ldev-portal-config-set)
- [ldev portal audit](#ldev-portal-audit)
- [ldev portal inventory sites](#ldev-portal-inventory-sites)
- [ldev portal inventory pages](#ldev-portal-inventory-pages)
- [ldev portal inventory page](#ldev-portal-inventory-page)
- [ldev portal inventory structures](#ldev-portal-inventory-structures)
- [ldev portal inventory templates](#ldev-portal-inventory-templates)
- [ldev portal search indices](#ldev-portal-search-indices)
- [ldev portal search mappings](#ldev-portal-search-mappings)
- [ldev portal search query](#ldev-portal-search-query)
- [ldev portal reindex status](#ldev-portal-reindex-status)
- [ldev portal reindex watch](#ldev-portal-reindex-watch)
- [ldev portal reindex tasks](#ldev-portal-reindex-tasks)
- [ldev portal reindex speedup-on](#ldev-portal-reindex-speedup-on)
- [ldev portal reindex speedup-off](#ldev-portal-reindex-speedup-off)
- [ldev portal theme-check](#ldev-portal-theme-check)
- [ldev portal page-layout export](#ldev-portal-page-layout-export)
- [ldev portal page-layout diff](#ldev-portal-page-layout-diff)

### Resources

- [Resources overview and workflows](#resources-structures-templates-adts-fragments)
- [Migration pipeline guide](/resource-migration-pipeline)

### Deploy commands

- [ldev deploy all](#ldev-deploy-all)
- [ldev deploy module](#ldev-deploy-module)
- [ldev deploy theme](#ldev-deploy-theme)
- [ldev deploy service](#ldev-deploy-service)
- [ldev deploy watch](#ldev-deploy-watch)
- [ldev deploy prepare](#ldev-deploy-prepare)
- [ldev deploy status](#ldev-deploy-status)
- [ldev deploy cache-update](#ldev-deploy-cache-update)

### Database commands

- [ldev db sync](#ldev-db-sync)
- [ldev db download](#ldev-db-download)
- [ldev db import](#ldev-db-import)
- [ldev db query](#ldev-db-query)
- [ldev db files-download](#ldev-db-files-download)
- [ldev db files-mount](#ldev-db-files-mount)
- [ldev db files-detect](#ldev-db-files-detect)

### Environment (advanced)

- [ldev env init](#ldev-env-init)
- [ldev env restart](#ldev-env-restart)
- [ldev env recreate](#ldev-env-recreate)
- [ldev env restore](#ldev-env-restore)
- [ldev env clean](#ldev-env-clean)
- [ldev env wait](#ldev-env-wait)
- [ldev env diff](#ldev-env-diff)
- [ldev env is-healthy](#ldev-env-is-healthy)

### OSGi and Gogo

- [ldev osgi gogo](#ldev-osgi-gogo)
- [ldev osgi status](#ldev-osgi-status)
- [ldev osgi diag](#ldev-osgi-diag)
- [ldev osgi thread-dump](#ldev-osgi-thread-dump)
- [ldev osgi heap-dump](#ldev-osgi-heap-dump)

### Worktree commands

- [ldev worktree setup](#ldev-worktree-setup)
- [ldev worktree start](#ldev-worktree-start)
- [ldev worktree env](#ldev-worktree-env)
- [ldev worktree clean](#ldev-worktree-clean)
- [ldev worktree gc](#ldev-worktree-gc)
- [ldev worktree btrfs-refresh-base](#ldev-worktree-btrfs-refresh-base)

---

## Agentic roles

This reference uses two different axes:

- `support level`: how strongly the command is supported and positioned publicly
- `agentic role`: how useful the command is as part of the preferred workflow for agents

Current `agent-core` commands:

- [`doctor`](#ldev-doctor)
- [`context`](#ldev-context)
- [`status`](#ldev-status)
- [`portal check`](#ldev-portal-check)
- [`portal audit`](#ldev-portal-audit)
- [`portal inventory`](#ldev-portal-inventory-sites)
- [`logs diagnose`](#ldev-logs-diagnose)
- [`oauth install`](#ldev-oauth-install)
- [`mcp check`](#ldev-mcp)

Current `runtime-core` commands:

- [`setup`](#ldev-setup)
- [`start`](#ldev-start)
- [`stop`](#ldev-stop)
- [`logs`](#ldev-logs)
- [`deploy`](#ldev-deploy-all)
- [`db`](#ldev-db-sync)
- [`env`](#ldev-env-init)
- [`worktree`](#ldev-worktree-setup)
- [`osgi`](#ldev-osgi-gogo)

Current `specialized` commands:

- [`resource`](#resources-structures-templates-adts-fragments)
- [`portal search`](#ldev-portal-search-indices)
- [`portal reindex`](#ldev-portal-reindex-status)
- [`portal page-layout`](#ldev-portal-page-layout-export)
- [`portal config`](#ldev-portal-config-get)
- [`portal theme-check`](#ldev-portal-theme-check)
- [`mcp probe`](#ldev-mcp)
- [`mcp openapis`](#ldev-mcp)

Current `human-only` or `internal` commands:

- `shell`
- `deploy watch`
- interactive `osgi gogo`
- hidden maintainer commands such as `health`, `perf`, `snapshot`, `restore`, `ai`

This agentic taxonomy does not replace the support stance later on this page. It complements it.

---

## Daily workflow

### ldev doctor

Validate host prerequisites and project configuration before starting the environment.

`doctor` is the first command to run on a new machine or before opening a support issue. It checks the Docker CLI and daemon separately, validates the detected repo layout, reports host memory guidance, warns about port conflicts, and highlights missing OAuth2 or activation key setup.

```bash
ldev doctor
ldev doctor --json
```

| Option              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `--format <format>` | Output format: `text`, `json`, `ndjson` (default: `text`) |
| `--json`            | Alias of `--format json`                                  |
| `--ndjson`          | Alias of `--format ndjson`                                |

---

### ldev context

Resolve the current repo, runtime and Liferay context as one stable snapshot.

This is one of the main public agent-facing commands. It returns the detected project type, key paths, portal URL, auth state, and the current command readiness matrix.

```bash
ldev context
ldev context --json
```

| Option              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `--format <format>` | Output format: `text`, `json`, `ndjson` (default: `text`) |
| `--json`            | Alias of `--format json`                                  |
| `--ndjson`          | Alias of `--format ndjson`                                |

---

### ldev setup

Pull Docker images, seed `docker/.env`, and warm the deploy cache.

`setup` is part of the classic `ldev-native` flow. It is not part of the standard Blade Workspace flow.

```bash
# Solo DXP — H2 + embedded Elasticsearch (default)
ldev setup

# DXP + external Elasticsearch
ldev setup --with elasticsearch

# DXP + external Elasticsearch + PostgreSQL
ldev setup --with elasticsearch --with postgres
```

The chosen profile is persisted to `docker/.env` (`COMPOSE_FILE`), so subsequent `ldev start` / `ldev stop` commands pick it up automatically.

Options:

- `--with <service>`: Add a compose service overlay (`elasticsearch`, `postgres`). Repeatable.
- `--skip-pull`: Skip `docker compose pull`.
- `--format <format>`: Output format: `text`, `json`, `ndjson` (default: `text`).

---

### ldev start

Start containers and wait for Liferay to become healthy.

```bash
ldev start
ldev start --activation-key-file /path/to/key.xml
ldev start --no-wait
ldev start --timeout 300
```

| Option                         | Description                             |
| ------------------------------ | --------------------------------------- |
| `--activation-key-file <file>` | Copy a DXP activation key before start  |
| `--no-wait`                    | Do not wait for Liferay health          |
| `--timeout <seconds>`          | Health wait timeout (default: `250`)    |
| `--format <format>`            | Output format: `text`, `json`, `ndjson` |

---

### ldev oauth install

Deploy the bundled OAuth installer into the running portal, create or update the ldev OAuth2 apps, and optionally persist the read/write credentials into `.liferay-cli.local.yml`.

```bash
ldev oauth install --write-env
ldev oauth install --company-id 20116
ldev oauth install --company-id 20116 --user-id 20123
ldev oauth install --scope Liferay.Headless.Admin.Content.everything.write --write-env
ldev oauth install --scope-profile objects --write-env
ldev oauth install --scope Liferay.Object.Admin.REST.everything.write --scope Liferay.Headless.Object.everything.write --write-env
```

Operational notes:

- run this after `ldev start`
- the command creates both a read/write app and a read-only app
- `--write-env` stores the read/write credentials in `.liferay-cli.local.yml`
- `--scope` lets you merge additional scope aliases on demand
- `--scope-profile` lets you merge a named scope bundle such as `content-authoring`, `site-admin`, `objects`, or `max-test`
- when `--scope` is combined with `--write-env`, the merged `oauth2.scopeAliases` value is also persisted
- the read-only credentials are printed for inspection/export workflows
- if you configure the read-only credentials as the active runtime credentials, write commands will fail by design
- in `blade-workspace`, the current flow provisions through bundle deploy + OSGi config instead of depending on Gogo

Options:

- `--company-id <id>`: Use a specific company ID.
- `--user-id <id>`: Use a specific user ID within company.
- `--scope <alias>`: Add an OAuth2 scope alias. Repeatable.
- `--scope-profile <name>`: Add a named OAuth2 scope profile. Repeatable.
- `--write-env`: Persist read/write credentials to `.liferay-cli.local.yml`.
- `--format <format>`: Output format: `text`, `json`, `ndjson`.

---

### ldev stop

Stop running containers.

```bash
ldev stop
```

| Option              | Description                             |
| ------------------- | --------------------------------------- |
| `--format <format>` | Output format: `text`, `json`, `ndjson` |

---

### ldev status

Show environment status (containers, Liferay health).

```bash
ldev status
ldev status --json
```

| Option              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `--format <format>` | Output format: `text`, `json`, `ndjson` (default: `json`) |

---

### ldev logs

Stream container logs.

```bash
ldev logs
ldev logs --since 5m
ldev logs --service database
ldev logs --no-follow
```

| Option                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `--service <service>` | Filter by service name                            |
| `--since <since>`     | Limit to recent logs (e.g. `5m`, `1h`, timestamp) |
| `--no-follow`         | Dump logs without following                       |

#### ldev logs diagnose

Analyze recent logs and group exceptions by type and frequency.

```bash
ldev logs diagnose
ldev logs diagnose --since 30m
ldev logs diagnose --json
```

| Option                | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `--service <service>` | Service to analyze (default: `liferay`)                   |
| `--since <since>`     | Log window (default: `10m`)                               |
| `--format <format>`   | Output format: `text`, `json`, `ndjson` (default: `json`) |

---

### ldev shell

Open an interactive shell inside the Liferay container.

```bash
ldev shell
```

---

### ldev mcp

Inspect the official Liferay MCP server and its runtime availability.

```bash
ldev mcp check
ldev mcp probe --username test@liferay.com --password test
ldev mcp openapis --authorization-header 'Basic ...'
```

Use this namespace when you need to verify:

- whether the MCP feature flag is enabled
- which endpoint is actually responding in the current runtime
- whether the MCP initialize handshake works
- what the MCP `get-openapis` tool returns

`ldev mcp` is diagnostic and interoperability-oriented. It does not replace the higher-level `ldev` workflows such as `portal inventory`.

---

## Project setup

### ldev project init

Create a new project scaffold with Docker Compose, Gradle workspace and config files.

Both `--name` and `--dir` are required.

```bash
ldev project init --name my-project --dir ~/projects/my-project
BIND_IP=100.115.222.80 ldev project init --name my-project --dir ~/projects/my-project
```

---

## Advanced namespaces

The following namespaces remain available and tested, but are not presented as equally central in the public onboarding contract:

- `portal` beyond `check` and `auth`
- `resource`
- `deploy`
- `env` advanced operations
- `db`
- `osgi`
- `worktree`

Use them when they solve a real need, but keep the narrower onboarding story in mind when planning adoption or team-wide rollout.

## Support levels

Use this rough support stance when deciding how much weight to give a command group:

- `core`
  [`doctor`](#ldev-doctor), [`context`](#ldev-context), [`setup`](#ldev-setup), [`start`](#ldev-start), [`stop`](#ldev-stop), [`status`](#ldev-status), [`logs`](#ldev-logs), [`shell`](#ldev-shell), [`project`](#ldev-project-init), [`portal check`](#ldev-portal-check), [`portal auth`](#ldev-portal-auth-token)
- `specialized but supported`
  advanced [`portal`](#ldev-portal-check), [`resource`](#resources-structures-templates-adts-fragments), [`deploy`](#ldev-deploy-all), advanced [`env`](#ldev-env-init), [`db`](#ldev-db-sync), [`osgi`](#ldev-osgi-gogo), [`worktree`](#ldev-worktree-setup)
- `internal / maintainer-facing`
  `health`, `perf`, `snapshot`, `restore`, `ai`

Internal commands may remain available for automation or repository maintenance without being treated as the main product surface.

---

## Portal

Commands that connect to a running Liferay instance via OAuth2. Run `ldev portal check` first.

For end-to-end inventory examples, see [Portal Inventory](/portal-inventory).

Alias: `ldev liferay`

### ldev portal check

Verify OAuth2 auth and basic API reachability.

```bash
ldev portal check
ldev portal check --json
```

| Option              | Description                             |
| ------------------- | --------------------------------------- |
| `--format <format>` | Output format: `text`, `json`, `ndjson` |

---

### ldev portal auth token

Fetch an OAuth2 access token for scripting.

```bash
ldev portal auth token
```

---

### ldev portal config get

Read one portal property or OSGi config PID from local config files.

```bash
ldev portal config get portal.url
ldev portal config get com.liferay.portal.search.elasticsearch7.configuration.ElasticsearchConfiguration
```

### ldev portal config set

Write one portal property or OSGi config key into local config files.

```bash
ldev portal config set portal.url http://localhost:8080
```

---

### ldev portal audit

Quick portal health snapshot: accessible sites, API reachability.

```bash
ldev portal audit
ldev portal audit --site /my-site
ldev portal audit --json
```

| Option              | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `--site <site>`     | Site friendly URL or numeric ID (default: `/global`) |
| `--page-size <n>`   | Headless API page size (default: `200`)              |
| `--format <format>` | Output format (default: `json`)                      |

---

### ldev portal inventory sites

List all accessible sites.

```bash
ldev portal inventory sites
ldev portal inventory sites --json
```

### ldev portal inventory pages

List pages of a site as a navigable hierarchy.

```bash
ldev portal inventory pages --site-id 20121
```

### ldev portal inventory page

Inspect a specific page or display page.

```bash
ldev portal inventory page --site-id 20121 --friendly-url /home
```

### ldev portal inventory structures

List journal structures for a site.

```bash
ldev portal inventory structures
ldev portal inventory structures --site-id 20121
```

### ldev portal inventory templates

List web content templates for a site.

```bash
ldev portal inventory templates
ldev portal inventory templates --site-id 20121
```

---

### ldev portal search indices

List Elasticsearch indices.

This command works against:

- the internal DXP sidecar (`localhost:9201` inside the `liferay` container) in the default profile
- the external Elasticsearch service when you use `ldev setup --with elasticsearch`

```bash
ldev portal search indices
ldev portal search indices --json
```

### ldev portal search mappings

Show mappings for one index.

```bash
ldev portal search mappings --index liferay-0
```

### ldev portal search query

Execute a simple Elasticsearch query.

```bash
ldev portal search query --index liferay-0 --q "title:news"
```

---

### ldev portal reindex status

Show reindex progress in Elasticsearch.

```bash
ldev portal reindex status
```

### ldev portal reindex watch

Watch reindex progress in real time.

```bash
ldev portal reindex watch
```

### ldev portal reindex tasks

List active Liferay reindex tasks.

```bash
ldev portal reindex tasks
```

### ldev portal reindex speedup-on

Enable fast reindex mode (`refresh_interval=-1`).

```bash
ldev portal reindex speedup-on
```

### ldev portal reindex speedup-off

Restore normal refresh interval (`refresh_interval=1s`).

```bash
ldev portal reindex speedup-off
```

---

### ldev portal theme-check

Validate Clay icon coverage for a deployed theme.

```bash
ldev portal theme-check
ldev portal theme-check --theme my-theme
ldev portal theme-check --json
```

| Option              | Description                          |
| ------------------- | ------------------------------------ |
| `--theme <theme>`   | Theme name (default: `custom-theme`) |
| `--format <format>` | Output format (default: `json`)      |

---

### ldev portal page-layout export

Export a content page as normalized JSON.

```bash
ldev portal page-layout export --site-id 20121 --friendly-url /home
```

### ldev portal page-layout diff

Compare a live content page against an export file or another live page.

```bash
ldev portal page-layout diff --site-id 20121 --friendly-url /home --file export.json
```

---

## Resources (structures, templates, ADTs, fragments)

File-based workflows. Content lives in the repo; `resource` exports from the portal and imports back.

### Resource command map

- [ldev resource structure](#resource-read)
- [ldev resource template](#resource-read)
- [ldev resource adts](#resource-read)
- [ldev resource adt-types](#resource-read)
- [ldev resource fragments](#resource-read)
- [ldev resource resolve-adt](#resource-read)
- [ldev resource export-structures](#resource-export)
- [ldev resource export-templates](#resource-export)
- [ldev resource export-adts](#resource-export)
- [ldev resource export-fragments](#resource-export)
- [ldev resource export-structure](#resource-export)
- [ldev resource export-template](#resource-export)
- [ldev resource export-adt](#resource-export)
- [ldev resource export-fragment](#resource-export)
- [ldev resource import-structures](#resource-import)
- [ldev resource import-templates](#resource-import)
- [ldev resource import-adts](#resource-import)
- [ldev resource import-fragments](#resource-import)
- [ldev resource import-structure](#resource-import)
- [ldev resource import-template](#resource-import)
- [ldev resource import-adt](#resource-import)
- [ldev resource import-fragment](#resource-import)
- [ldev resource migration-init](#resource-migration)
- [ldev resource migration-run](#resource-migration)
- [ldev resource migration-pipeline](#resource-migration)

### Resource read

| Command                             | Description                                 |
| ----------------------------------- | ------------------------------------------- |
| `ldev resource structure --key KEY` | Read one journal structure by key or ID     |
| `ldev resource template --key KEY`  | Read one journal template                   |
| `ldev resource adts`                | List ADTs for a site                        |
| `ldev resource adt-types`           | List built-in ADT type mappings             |
| `ldev resource fragments`           | List fragment collections and entries       |
| `ldev resource resolve-adt`         | Resolve an ADT by display style, id or name |

### Resource export

```bash
ldev resource export-structures           # all structures
ldev resource export-templates            # all templates
ldev resource export-adts                 # all ADTs
ldev resource export-fragments            # all fragments

ldev resource export-structure --key ARTICLE_STRUCTURE
ldev resource export-template --key ARTICLE_TEMPLATE
ldev resource export-adt --display-style ...
ldev resource export-fragment --collection blog-cards --key card-featured
```

### Resource import

```bash
ldev resource import-structures --structure ARTICLE_STRUCTURE
ldev resource import-structures --apply
ldev resource import-structures --all-sites

ldev resource import-templates --template ARTICLE_TEMPLATE
ldev resource import-templates --apply

ldev resource import-adts --adt SEARCH_RESULTS
ldev resource import-adts --apply
ldev resource import-fragments

ldev resource import-structure --file path/to/structure.json
ldev resource import-template --file path/to/template.ftl
ldev resource import-adt --file path/to/adt.ftl
ldev resource import-fragment --collection blog-cards --key card-featured
```

### Resource migration

Change field IDs in a structure without losing live content.

```bash
# Step 1 — generate descriptor
ldev resource migration-init --key ARTICLE_STRUCTURE

# Step 2 — edit the descriptor and, when possible, scope it with articleIds/folderIds/rootFolderIds
ldev resource migration-run --migration-file migration.json

# Or run the whole flow in one go, including cleanup
ldev resource migration-pipeline --migration-file migration.json --run-cleanup
```

---

## Deploy

Build and deploy modules, themes and services.

### ldev deploy all

Compile and deploy all modules for the current repo.

```bash
ldev deploy all
```

### ldev deploy module

Compile and deploy a single module or theme.

```bash
ldev deploy module my-module
```

### ldev deploy theme

Compile and deploy the theme.

```bash
ldev deploy theme
```

### ldev deploy service

Run Service Builder and restore tracked `service.properties`.

```bash
ldev deploy service
```

### ldev deploy watch

Watch for file changes and redeploy only the affected unit.

```bash
ldev deploy watch
```

### ldev deploy prepare

Build deploy artifacts without touching the running Docker environment.

```bash
ldev deploy prepare
```

### ldev deploy status

Show observed deploy artifacts and OSGi runtime state.

```bash
ldev deploy status
```

### ldev deploy cache-update

Copy `build/docker/deploy` artifacts into the deploy cache.

```bash
ldev deploy cache-update
```

---

## Database

State transfer between LCP and the local environment.

### ldev db sync

Download a database backup from LCP and import it locally (combines `download` + `import`).

```bash
ldev db sync
ldev db sync --force
```

### ldev db download

Download a database backup from LCP into `docker/backups`.

```bash
ldev db download
```

### ldev db import

Import a local SQL backup into the local postgres service.

```bash
ldev db import --file docker/backups/liferay.sql --force
```

### ldev db query

Execute SQL directly against the local PostgreSQL container.

```bash
ldev db query "SELECT id_, title FROM JournalArticle LIMIT 10"
```

### ldev db files-download

Download Document Library content from LCP.

```bash
ldev db files-download
```

### ldev db files-mount

Mount or recreate the Docker volume for Document Library.

```bash
ldev db files-mount
```

### ldev db files-detect

Detect a `document_library` directory and store it in `docker/.env`.

```bash
ldev db files-detect
```

---

## Environment (advanced Docker)

For recovery and diagnostics, not daily use. Prefer top-level commands (`start`, `stop`, `status`, `logs`).

### ldev env init

Create or normalize `docker/.env` for the current repo or worktree.

```bash
ldev env init
```

### ldev env restart

Restart the Liferay service and optionally wait for health.

```bash
ldev env restart
ldev env restart liferay
```

### ldev env recreate

Recreate the Liferay service containers while keeping volumes.

```bash
ldev env recreate
```

### ldev env restore

Replace the current runtime data from `main` or `BTRFS_BASE`.

```bash
ldev env restore
```

### ldev env clean

**Destructive.** Remove all local Docker resources and bind-mounted runtime data.

```bash
ldev env clean
```

### ldev env wait

Wait until Liferay is healthy (useful in scripts).

```bash
ldev env wait
ldev env wait --timeout 300
```

### ldev env diff

Compare the current environment against a saved baseline.

```bash
ldev env diff
```

### ldev env is-healthy

Return a scriptable health exit code (`0` = healthy).

```bash
ldev env is-healthy && echo "ready"
```

---

## OSGi / Gogo Shell

Runtime diagnostics for an already-running environment.

### ldev osgi gogo

Open a live Gogo Shell session.

```bash
ldev osgi gogo
ldev osgi gogo "lb | grep -i my-bundle"
```

### ldev osgi status

Inspect the state of a specific OSGi bundle.

```bash
ldev osgi status my.bundle.symbolic.name
```

### ldev osgi diag

Run Gogo `diag` for a specific bundle to diagnose resolution errors.

```bash
ldev osgi diag my.bundle.symbolic.name
```

### ldev osgi thread-dump

Collect one or more thread dumps from the Liferay process.

```bash
ldev osgi thread-dump
```

### ldev osgi heap-dump

Generate a heap dump from the Liferay process.

```bash
ldev osgi heap-dump
```

---

## Worktrees

Isolated git worktrees with separate local runtime state. Only needed when working on multiple branches simultaneously.

### ldev worktree setup

Create or reuse a git worktree and optionally prepare its local environment.

```bash
ldev worktree setup --name issue-123
ldev worktree setup --name issue-123 --with-env
```

If you use `--with-env`, `ldev` now runs a preflight first. When the main checkout is still running and the host is not using Btrfs snapshots, the command fails before creating the git worktree so you can stop `main` cleanly first.

### ldev worktree start

Prepare and start the local environment of an existing worktree.

```bash
ldev worktree start issue-123
```

### ldev worktree env

Prepare or inspect the local env wiring of a worktree.

```bash
ldev worktree env
```

### ldev worktree clean

**Destructive.** Remove a worktree and its local runtime data.

```bash
ldev worktree clean issue-123 --force
```

### ldev worktree gc

Preview or remove stale worktrees conservatively.

```bash
ldev worktree gc           # preview
ldev worktree gc --apply   # remove stale worktrees
```

### ldev worktree btrfs-refresh-base

Linux-only. Refresh `BTRFS_BASE` from the current main env data root.

```bash
ldev worktree btrfs-refresh-base
```

---

## Output formats

All commands that produce structured data accept:

```bash
ldev <command> --json           # pretty JSON
ldev <command> --ndjson         # newline-delimited JSON (streaming)
ldev <command> --format json    # explicit flag
```

Exit codes are stable. See [Automation Contract](/automation) for the full specification.

---

[Back to Home](/)
