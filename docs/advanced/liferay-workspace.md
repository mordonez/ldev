---
title: Liferay Workspace
description: Use ldev on top of a standard Blade workspace without switching to ldev-native.
---

# Liferay Workspace

`ldev` can work on top of a standard Blade workspace.

That matters for teams that already use the standard Liferay development model and do not want to move to `ldev-native`.

## Typical setup

```bash
npm install -g @mordonezdev/ldev
blade init ai-workspace
cd ai-workspace
ldev doctor
ldev start --activation-key-file /path/to/activation-key.xml
ldev oauth install --write-env
```

## What you still get

Even in a workspace, `ldev` still helps with:

- doctor and environment checks
- portal discovery
- resource export and import workflows
- agent bootstrap with `ldev ai install`
- structured output for scripts and agents

## AI coexistence

Liferay Workspace already has an official AI-oriented workflow with folders such as `.workspace-rules`.

`ldev ai install` complements that setup. It does not need to replace the workspace model to be useful.

## When to choose each model

Use `ldev-native` when you want:

- the full Docker-native local suite managed by `ldev`
- isolated worktree environments
- stronger production-to-local workflows

Use Blade workspace plus `ldev` when you want:

- to keep the standard Liferay project layout
- `ldev` as an operational layer on top of it
