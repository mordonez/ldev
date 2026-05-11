---
title: What is ldev
description: A focused CLI for the Liferay operations that today only live in the admin UI.
---

# What is ldev

`ldev` is a CLI that fills the automation gaps in Liferay.

Liferay is a complete platform, but a lot of day-to-day work — importing
structures, exporting templates, migrating articles between content models,
bootstrapping a clean local environment — still lives in the admin UI or
behind uneven APIs (Headless, legacy JSONWS, Gogo, file-based deploy).

That is fine for occasional clicks. It is a wall for CI, scripts, and AI
agents.

`ldev` exposes those operations as commands with structured output, plus the
surrounding scaffolding (Docker, isolated worktrees, MCP) needed to run them
safely.

## What it actually covers

These are the parts where `ldev` does something Liferay does not do for you:

| Capability | Why it matters |
| --- | --- |
| `resource export-*` / `import-*` | Structures, templates, ADTs and fragments are UI-only in Liferay. `ldev` turns them into reviewable files. |
| `resource migration-pipeline` | Liferay has no native pipeline for migrating articles when a journal structure changes. `ldev` does. |
| `portal inventory ...` | One structured call returns sites, pages, structures and templates together — the consolidated context a developer or agent needs first. |
| `project init` / `setup` / `start` | Stand up a working Docker-based Liferay environment from zero. |
| `worktree setup --with-env` | Each branch with its own Postgres, Liferay and OSGi state. On Linux + Btrfs, swaps are near-instant. |
| `oauth install --write-env` | Deploy the installer bundle, create the OAuth app, verify the token, write credentials. One command. |
| `ldev-mcp-server` (15 tools) | The same workflows exposed over MCP, so an agent can run them without a custom integration. |

## What it does not do

To stay honest:

- **`logs diagnose`** groups exceptions in recent Docker Compose logs by regex
  and applies a small set of keyword rules. It speeds up triage; it is not
  root-cause analysis.
- **`doctor`** runs environment readiness checks (tools installed, ports free,
  containers up, optional HTTP/Gogo probes). It catches setup problems early;
  it does not inspect application config or data.
- **`db sync`** pulls a database backup from **Liferay Cloud (LCP)** and
  imports it. For self-hosted, use `db import --file <backup>` with a backup
  you already have.
- **`portal inventory`**, **`osgi status|diag`**, **`portal check`** are
  convenience wrappers around Liferay's Headless API and Gogo Shell. They are
  honest wrappers — useful, but not new capabilities.

## Why agents matter here

Without a CLI like this, an AI agent cannot really operate Liferay. The
critical operations live in the UI, and an agent cannot click. By exposing
those operations as commands and registering them as MCP tools, `ldev` gives
agents the execution layer they were missing.

The CLI is always the canonical path. MCP is acceleration on top.

The reason this works is not that we built AI features. It is that the
surface humans need on Liferay — reproducible environments, isolated
runtimes, scriptable resources, structured output — is the same surface
agents need. Fix the system, and both consumers benefit. See
[Why ldev Exists](/core-concepts/why-ldev-exists) for the full argument.

## Where to go next

- [Quickstart](/getting-started/quickstart) — install and stand up an
  environment.
- [Resource workflows](/workflows/export-import-resources) — the core of what
  makes `ldev` different.
- [Structure migration](/workflows/resource-migration-pipeline) — the
  workflow that does not exist anywhere else.
- [Agents and MCP](/agentic/) — what changes once `ldev` is in your editor.
