---
title: Key Capabilities
description: Overview of the core value propositions of ldev, including diagnostics, portal discovery, and AI integration.
---

# Key Capabilities

This page is the detailed capability reference for `ldev`.

For command-by-command implementation details, use the dedicated guides:

- [Portal Inventory](/portal-inventory)
- [Resource Migration Pipeline](/resource-migration-pipeline)
- [AI Integration](/ai-integration)
- [Worktree Environments](/worktree-environments)
- [Automation Contract](/automation)

## Why ldev exists

[Liferay](https://www.liferay.com) local environments have a specific set of problems that generic tools do not solve well: heavy Java runtime startup, [OAuth2](https://oauth.net/2/)-gated portal APIs, [OSGi](https://www.osgi.org) bundle state, content resources that live in the portal but need to be versioned in a repo, and deploy loops that are slower than typical web stacks.

`ldev` is a Liferay-focused CLI that accepts those constraints and builds workflows around them. It does not try to replace the official Liferay Workspace standard. Its goal is to make Liferay local work predictable: clear diagnostics when something breaks, consistent workflows for the things Liferay teams do every day, and advanced operational flows beyond the standard workspace baseline.

Project type guidance:

- **For teams new to `ldev`**: Start with a standard **Liferay Workspace** (blade-init). `ldev` adds diagnostics, runtime shortcuts, and portal-aware automation on top.
- **For the full `ldev` potential**: Use `ldev project init` with Docker Compose (`docker/` + `liferay/` layout). This unlocks isolated worktrees, snapshot-based workflows, and advanced runtime capabilities.
- **Existing Blade workspaces**: `ldev` integrates with your current setup without requiring migration.

---

## 1. Diagnostics that understand Liferay — `doctor`

`ldev doctor` validates the full chain before you start: Docker CLI and daemon separately, project layout, host memory guidance, port conflicts, and OAuth2 auth setup. It gives the same report in `--json` for CI and scripting.

```bash
ldev doctor
ldev doctor --json | jq '.checks[] | select(.ok == false)'
```

This is the first command to run on a new machine, before filing a support issue, or at the start of an automated agent session.

**Core. Useful to: developers, CI, AI agents.**

---

## 2. Portal context discovery — `portal inventory`

Before you can fix or build something in Liferay, you often need to know what is actually running: which sites exist, what pages they contain, and what a specific page is made of. `ldev portal inventory` answers all of this without opening a browser.

```bash
# list all sites
ldev portal inventory sites --json

# explore the full page hierarchy for a site
ldev portal inventory pages --site /my-site

# inspect a specific page: fragments, widgets, content structure, metadata
ldev portal inventory page --url /web/my-site/home --json
```

`portal inventory page` is especially useful when you need full context quickly. A single call returns the page type, its layout structure, every fragment and widget on the page, the content structure and article fields (for display pages), and direct links to the admin edit view. It eliminates the need to navigate the DXP admin UI just to understand what a page contains.

For AI agents, `ldev portal inventory page --url <url> --json` is the fastest way to get a complete, structured picture of a page before making any changes.

**Core (for portal work). Useful to: developers, content teams, AI agents.**

See also: [Portal Inventory](/portal-inventory).
Implementation note: [API Surfaces](/api-surfaces).

Current note on the official Liferay MCP server:

- it is useful for AI/agent interoperability
- in the audited runtime it currently exposes an OpenAPI bridge, not a rich discovery toolset
- it does not replace `portal inventory` today

See: [MCP Strategy](/mcp-strategy).

---

## 3. Portal-aware resource sync and structure migration — `resource`

Content resources — Journal structures, templates, ADTs, and fragments — live in the portal database but should be versioned in your repo. `ldev resource` makes this bidirectional and explicit.

```bash
# export all structures for a site to JSON files
ldev resource export-structures --site /my-site

# import local changes back to the running portal
ldev resource import-structures
```

This is the difference between content that drifts between environments and content that can be exported, reviewed, committed, and re-imported reliably.

One of the hardest Liferay problems in production is modifying a Journal structure that already has content: fields need to be removed, renamed, or reorganized, and all existing articles must be migrated to match. Done manually or with one-off scripts, this is error-prone and irreversible. `ldev resource migration-pipeline` solves this by generating an explicit plan — which fields change, which articles are affected, what data transformation runs — so the migration can be reviewed, tested, and applied in a controlled way.

```bash
# generate a migration plan, review it, then apply
ldev resource migration-pipeline --site /my-site
```

Combined with `ldev worktree`, this is how to validate a structure migration safely: run the pipeline in an isolated worktree with a copy of production data, verify the results, then apply to production with confidence.

**Advanced. Useful to: developers, content teams, CI pipelines.**

See also: [Resource Migration Pipeline](/resource-migration-pipeline).

---

## 4. Project bootstrap — `project`

`ldev project init` sets up the `ldev-native` layout with Docker Compose, where `ldev` manages the full local runtime model. This unlocks the complete feature set: isolated worktrees, snapshot-based workflows, and advanced runtime control.

Alternatively, use `blade init` for a standard Liferay Workspace and integrate `ldev` on top of that structure.

`ldev project init` works without creating a git commit by default, so the generated files are always reviewable before they are committed.

```bash
ldev project init --name my-project --dir ./my-project
```

**Core. Useful to: developers setting up new projects or migrating existing ones.**

---

## 5. Deploy and watch loops — `deploy`

Liferay build cycles are slow. `ldev deploy` gives explicit control: build a single module, rebuild a theme, or watch for changes and redeploy automatically. `deploy prepare` builds artifacts without touching Docker, which is useful when you need to validate the build before applying it.

```bash
ldev deploy module my-portlet          # rebuild one module
ldev deploy theme                      # rebuild and deploy the theme
ldev deploy watch --module my-portlet  # file watcher + auto-redeploy
ldev deploy prepare                    # build only, no Docker interaction
```

**Advanced. Useful to: developers in active development cycles.**

---

## 6. Isolated worktree environments — `worktree`

`ldev worktree` wraps [git worktrees](https://git-scm.com/docs/git-worktree) with separate local runtime state. Each worktree gets its own Docker data directory so multiple branches can have live Liferay environments simultaneously, without state collisions.

```bash
ldev worktree setup --name issue-123 --with-env
cd .worktrees/issue-123
ldev start
```

This matters most when you need to test a branch against production data, run two environments for comparison, or hand off an isolated environment to a CI job or AI agent without disrupting your main working state.

The tradeoff: each worktree runs its own containers, which means higher RAM and disk usage. Treat it as a tool for specific situations, not a default workflow.

**Advanced. Useful to: developers, AI agents doing branch-scoped work.**

See also: [Worktree Environments](/worktree-environments).

---

## 7. AI agent integration — `ai install`

`ldev ai install` deploys a set of reusable skills and an `AGENTS.md` bootstrap document into a project. Skills are Markdown files that encode Liferay-specific workflows — deploying, troubleshooting, developing, migrating structures — in a format that coding agents ([Claude](https://claude.ai), [GitHub Copilot](https://github.com/features/copilot), [OpenAI Codex](https://github.com/openai/codex)) can use as structured context.

```bash
ldev ai install --target .              # install vendor skills + AGENTS.md
ldev ai install --target . --project-context
ldev ai install --target . --project    # also install project-owned skills
ldev ai update --target .               # update vendor skills to latest
```

The installed skills cover: `liferay-expert` (routing), `developing-liferay`, `deploying-liferay`, `troubleshooting-liferay`, `migrating-journal-structures`, and `automating-browser-tests`.

`AGENTS.md` is the standard entrypoint for agents. It tells them to run `ldev doctor` and `ldev context --json` as the first step, which gives them a stable snapshot of the repo layout, portal URL, auth state, and available command namespaces before they do anything else.

`docs/ai/project-context.md` is optional and is installed only with `--project-context` or `--project`.

**Advanced. Useful to: teams using AI-assisted development workflows.**

See also: [AI Integration](/ai-integration).

---

## 8. Machine-readable output contract — `--json` / `--ndjson`

Core commands expose a stable structured output contract. Every JSON response includes `ok: true` or `ok: false`. Errors go to stderr with a fixed `{ code, message, details }` envelope. This is reliable enough to use in CI scripts, agent sessions, and piped shell workflows.

```bash
ldev status --json
ldev context --json   # repo paths, portal URL, auth state, worktree info
ldev portal inventory structures --site /my-site --ndjson
```

See [Automation Contract](/automation) for the full surface and stability guarantees.

**Core (for automation). Useful to: CI pipelines, scripts, AI agents.**
