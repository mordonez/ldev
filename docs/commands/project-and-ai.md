---
title: Project and AI Commands
description: Minimal reference for project bootstrap and agent bootstrap workflows.
---

# Project and AI Commands

## `ldev project init`

Create a new `ldev-native` project scaffold.

```bash
ldev project init --name my-project --dir ~/projects/my-project
```

## `ldev ai install`

Install the managed AI assets for a repo.

```bash
ldev ai install --target .
ldev ai install --target . --project-context
ldev ai install --target . --project --project-context
```

Key options:

- `--project-context`: scaffolds `docs/ai/project-context.md`
- `--project`: installs project-owned skills and agents
- `--skills-only`: refreshes managed vendor skills from the manifest

## `ldev ai update`

Refresh the managed vendor skills.

```bash
ldev ai update --target .
```

## `ldev ai status`

Inspect managed rules, manifests, and drift.

```bash
ldev ai status --target . --json
```

Typical next step after install:

```bash
ldev doctor --json
ldev context --json
```

In Blade workspaces, `ldev ai install` can coexist with the official AI folders and `.workspace-rules` workflow.
