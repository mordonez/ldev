---
title: Introduction
description: Why ldev exists, what it covers, and how to think about it before reading the command reference.
---

# Introduction

`ldev` is a CLI for the Liferay operations that today only live in the admin
UI — and for the surrounding scaffolding that makes those operations safe to
run from a script or an agent.

If you have not yet, start with [What is ldev](/getting-started/what-is-ldev)
for a one-page summary.

## Where Liferay leaves gaps

A few examples of work that today is harder than it should be:

- importing or exporting structures, templates, ADTs and fragments — UI-only
- migrating journal articles when a structure changes — no native pipeline
- standing up a clean local environment from a Liferay Cloud backup —
  manual steps
- giving an AI agent a real execution layer on Liferay — it cannot click

`ldev` is built around those gaps. Everything else is convenience.

## How to read the docs

The docs are organised in three layers:

1. **Getting started** — install, stand up an environment, run the first
   commands.
2. **Workflows** — full walkthroughs for the things `ldev` is built around:
   resources as files, structure migration, branch-isolated runtimes,
   reproducing production locally.
3. **Reference and advanced** — flags, configuration, MCP tools, OSGi probes,
   troubleshooting.

If you only have ten minutes, read [What is ldev](/getting-started/what-is-ldev)
and [Export and Import Resources](/workflows/export-import-resources).

## Two project shapes

`ldev` works in two ways:

- **`ldev-native`** — `ldev` manages a Docker-based local runtime end to end.
  Use this when you want a turnkey local Liferay.
- **Liferay Workspace (Blade)** — `ldev` runs on top of an existing standard
  workspace. Use this when your team already uses Blade and you want to keep
  that layout.

`ldev` detects which shape applies and adapts. You do not have to choose at
install time.

## Structured output by default

Every command that returns data supports `--json` (and `--ndjson` where
streaming makes sense). That matters because the same workflow is used by:

- developers running commands by hand
- scripts in CI
- AI agents over MCP

The output is identical. You build automation against it the same way you
read it.

## A note on honesty

A few things to set expectations for:

- `ldev logs diagnose` groups exceptions and applies a small set of keyword
  rules. It speeds up triage; it does not perform root-cause analysis.
- `ldev db sync` pulls from **Liferay Cloud (LCP)** only. For self-hosted,
  `ldev db import --file <backup>` with a backup you already have.
- Btrfs-accelerated worktrees are Linux-only. Other platforms still work,
  just without instant snapshots.

## Where to go next

- [What is ldev](/getting-started/what-is-ldev)
- [Quickstart](/getting-started/quickstart)
- [Export and Import Resources](/workflows/export-import-resources)
- [Resource Migration Pipeline](/workflows/resource-migration-pipeline)
- [Agents and MCP](/agentic/)
