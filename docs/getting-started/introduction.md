---
title: Introduction
description: What ldev is for and how to think about it before you use the command reference.
---

# Introduction

`ldev` is not a generic CLI for Liferay.

It is an operational CLI for maintenance and troubleshooting work:

- understand Liferay systems quickly
- diagnose issues faster
- reproduce production locally
- apply fixes safely
- verify results consistently

## Start with workflows, not commands

The main question is:

`How do I use ldev to solve a real Liferay problem?`

Not:

`What commands exist?`

That is why the docs are organized around workflows such as:

- diagnosing a broken environment
- fixing an OSGi bundle
- reproducing a production issue locally
- exploring a portal without depending on the UI

## The default operating model

Use `ldev` in this order:

1. understand the environment
2. diagnose the problem
3. apply the smallest safe fix locally
4. verify the result

Typical commands:

```bash
ldev context --json
ldev doctor --json
ldev logs diagnose --json
ldev portal inventory page --url /home --json
ldev osgi diag com.acme.foo.web
ldev deploy module foo-web
ldev portal check
```

## What makes ldev different

### Works with two local models

You can use `ldev` in two main ways:

- `ldev-native`: `ldev` manages its own Docker-based local runtime
- `blade-workspace`: `ldev` runs on top of a standard Liferay Workspace

That matters because `ldev` is not trying to replace the standard Liferay development layout. It can complement it.

### Production to local

You can move production-like state into local so debugging happens in a safer place.

```bash
ldev db sync --environment production --project my-lcp-project --force
ldev start
```

### Discovery without UI

You can inspect sites and pages directly from the CLI.

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
```

### Structured output

Humans and agents can use the same commands and the same JSON output.

### Agent bootstrap

`ldev ai install` prepares a repo so agents have the right rules, skills, and entrypoints:

```bash
ldev ai install --target .
ldev ai install --target . --project --project-context
```

## Where to go next

- [Quickstart](/getting-started/quickstart)
- [First Incident](/getting-started/first-incident)
- [Diagnose an Issue](/workflows/diagnose-issue)
- [PaaS to Local Migration](/workflows/paas-to-local-migration)
