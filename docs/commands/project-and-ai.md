---
title: Project and AI Commands
description: Minimal reference for project bootstrap and agent bootstrap workflows.
---

# Project and AI Commands

## `ldev project init`

Create a new project scaffold linked to local tooling.

```bash
ldev project init --list-liferay-versions
ldev project init my-project
ldev project init my-project --liferay-version dxp-2026.q1.7-lts --services postgres,elasticsearch
ldev project init --name my-project --dir ~/projects/my-project
ldev project init . --name my-project --liferay-version dxp-2026.q1.7-lts
ldev project init . --name my-project --services postgres
ldev project init . --name my-project --services postgres,elasticsearch
ldev project init --name my-project --dir . --commit
```

Options:

- `[dir]` — destination directory; when `--name` is omitted, the project name defaults to the directory name
- `--name <name>` — project name used for the scaffold
- `--dir <dir>` — destination directory; overrides the optional `[dir]` argument
- `--list-liferay-versions` — list promoted release keys from `https://releases-cdn.liferay.com/releases.json`
- `--all-liferay-versions` — include non-promoted releases when listing versions
- `--liferay-version <release-key>` — configure the generated workspace and Docker image for the selected release
- `--services postgres,elasticsearch` — opt in to additional Docker services
- `--commit` — create a git commit for the generated changes (by default, no commit is created)

After scaffold:

```bash
cd my-project
ldev start --activation-key-file /path/to/activation-key.xml
ldev oauth install --write-env
```

`ldev setup` is optional. Use it only when you want to pre-pull Docker images
or warm local runtime directories before starting.

## `ldev ai install`

Install the standard reusable AI assets into a project.

```bash
ldev ai install --target .
ldev ai install --target . --force
```

Options:

- `--target <dir>` (required) — project root
- `--force` — overwrite existing files

What the install produces:

- `AGENTS.md` (skipped on re-run without `--force` if already present)
- `CLAUDE.md`, `.github/copilot-instructions.md` (non-blade-workspace projects only)
- `.gemini/GEMINI.md`, `.cursorrules`
- `docs/ai/project-context.md` and `docs/ai/project-context.md.sample`

To install skills, use the skills.sh standard:

```bash
npx skills add https://github.com/mordonez/ldev
```

## `ldev ai bootstrap`

Aggregate project context and the doctor checks needed for an agent intent.

```bash
ldev ai bootstrap --intent=discover --json
ldev ai bootstrap --intent=develop --json
ldev --repo-root ../main-checkout ai bootstrap --intent=develop --json
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

When you are inside a worktree but need context from the main checkout,
prefer the global form `ldev --repo-root <path> ai bootstrap ...`.
## Typical next steps

```bash
ldev ai bootstrap --intent=develop --cache=60 --json
```

In Blade workspaces, `ldev ai install` coexists with the official AI folders and the `.workspace-rules` workflow instead of replacing them.
