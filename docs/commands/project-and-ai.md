---
title: Project and AI Commands
description: Minimal reference for project bootstrap and agent bootstrap workflows.
---

# Project and AI Commands

## `ldev project init`

Create a new project scaffold linked to local tooling.

```bash
ldev project init --name my-project --dir ~/projects/my-project
ldev project init --name my-project --dir . --services postgres
ldev project init --name my-project --dir . --services postgres,elasticsearch
ldev project init --name my-project --dir . --commit
```

Options:

- `--name <name>` (required) — project name used for the scaffold
- `--dir <dir>` (required) — destination directory
- `--services postgres,elasticsearch` — opt in to additional Docker services
- `--commit` — create a git commit for the generated changes (by default, no commit is created)

## `ldev ai install`

Install the standard reusable AI assets into a project.

```bash
ldev ai install --target .
ldev ai install --target . --project-context
ldev ai install --target . --project --project-context
ldev ai install --target . --skills-only
ldev ai install --target . --skill ldev-environment --skill liferay-discovery
ldev ai install --target . --force
ldev ai install --target . --local
```

Options:

- `--target <dir>` (required) — project root
- `--force` — overwrite `AGENTS.md` if it already exists
- `--local` — keep AI tooling local by adding generated agent/editor files to `.gitignore`, while `docs/ai` stays versionable
- `--skills-only` — only update vendor skills from the manifest
- `--project-context` — install project-owned context scaffolding (`docs/ai/project-context.md` + sample)
- `--project` — install project-owned skills and agents, filtered by detected project type; also installs the project context scaffold
- `--skill <name>` — install only specific vendor skills (repeatable)

What the install produces:

- `AGENTS.md` and tool-specific rule directories (`.claude/rules`, `.cursor/rules`, `.gemini`, `.github/instructions`, `.windsurf/rules`, `.workspace-rules`)
- vendor-managed skills under `.agents/skills/`
- optional project-owned skills and agents (`.agents/skills/project-*`) and project menu-map scaffolding under `docs/ai/menu/`

## `ldev ai update`

Safely refresh vendor skills listed in the manifest.

```bash
ldev ai update --target .
ldev ai update --target . --skill ldev-environment --skill liferay-discovery
```

`--skill <name>` rewrites the vendor manifest to the selected set and refreshes only those skills.

## `ldev ai status`

Inspect managed AI rules, manifest state, and drift.

```bash
ldev ai status --target .
ldev ai status --target . --format text
```

Defaults to JSON. Use this before `install` or `update` on an existing project to see what is managed, what has drifted, and what is project-owned.

## `ldev ai bootstrap`

Aggregate project context and the doctor checks needed for an agent intent.

```bash
ldev ai bootstrap --intent=discover --json
ldev ai bootstrap --intent=develop --json
ldev ai bootstrap --intent=develop --cache=60 --json
ldev ai bootstrap --intent=deploy --json
ldev ai bootstrap --intent=troubleshoot --json
ldev ai bootstrap --intent=migrate-resources --json
ldev ai bootstrap --intent=osgi-debug --json
```

Use this as the standard agent entrypoint. It returns `context` and, when the
intent needs readiness, `doctor`.

- `discover` stays context-only.
- `develop` keeps `doctor` intentionally cheap: repo/config/tool presence and
	readiness for local editing, without runtime, portal, or OSGi probes.
- `--cache <seconds>` reuses the full bootstrap result for the same intent and
	working tree while the cached entry is newer than the requested TTL.

## Typical next steps

```bash
ldev ai bootstrap --intent=develop --cache=60 --json
```

In Blade workspaces, `ldev ai install` coexists with the official AI folders and the `.workspace-rules` workflow instead of replacing them.
