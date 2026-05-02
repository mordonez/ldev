---
title: Operations Model
description: How ldev structures operational work — and where it actually adds capability vs. just convenience.
---

# Operations Model

`ldev` is built around two ideas:

1. **Cover the gaps Liferay leaves open** — operations that today only live
   in the admin UI, or that have no native pipeline at all.
2. **Use a predictable shape** for everything else, so humans, scripts and
   agents can run the same workflows the same way.

Most pages and demos talk about the second idea. This page focuses on the
first, and then layers the shape on top.

## The capability layer

These are the workflows where `ldev` does something Liferay does not do for
you cleanly. These are the reason to install it.

| Workflow | What it covers |
| --- | --- |
| Resources as files | `resource export-*` / `import-*` for structures, templates, ADTs and fragments. UI-only in Liferay. |
| Structure migration | `resource migration-init` + `migration-pipeline`. Liferay has no native migration of articles when a structure changes. |
| Local environment bootstrap | `project init` / `setup` / `start`. Working Docker-based Liferay from zero. |
| Branch-isolated runtime | `worktree setup --with-env`. Each branch with its own Postgres / Liferay / OSGi state. |
| OAuth bring-up | `oauth install --write-env`. Bundle deploy + Gogo + token verification + write to local config. |
| MCP execution layer | `ldev-mcp-server` exposes 15 ldev tools so agents can run real workflows. |

## The shape layer

For everything `ldev` does, a four-step shape is useful:

```
understand → diagnose → fix → verify
```

This is not a marketing claim about diagnosis quality. It is a rule of thumb
for the order of commands in any task.

### Understand

Get the consolidated context first.

```bash
ldev context --json
ldev portal inventory page --url /home --json
```

`portal inventory` is a context-aggregation surface: one call returns the
sites, pages, fragments, widgets and articles that would otherwise need
several Headless API calls.

### Diagnose

Use the shortest path to a useful signal.

```bash
ldev doctor --json
ldev logs diagnose --since 10m --json
ldev osgi diag com.acme.foo.web
```

Be honest about what these do:

- `doctor` checks environment readiness and (optionally) probes Docker, the
  portal HTTP endpoint, and Gogo
- `logs diagnose` groups recent exceptions by class with regex and applies a
  small set of keyword rules — useful for triage, not deep analysis
- `osgi diag` wraps Gogo `diag <bundleId>`

### Fix

Apply the smallest change that addresses the confirmed issue.

```bash
ldev deploy module foo-web
ldev resource import-structure --check-only --file path/to/structure.json
ldev resource import-structure --file path/to/structure.json
```

For resource changes, always run `--check-only` before mutating.

### Verify

For runtime/deploy changes, verify with the same commands you used to
diagnose:

```bash
ldev portal check
ldev logs diagnose --since 5m --json
```

For resource changes, verify with **read-after-write** evidence — read the
resource back and inspect the page it affects. Do not rely on logs alone.

```bash
ldev resource structure --site /global --structure MY_STRUCTURE
ldev portal inventory page --url /home --json
```

## What this means for agents

The same shape gives agents a predictable contract:

- pre-flight: `ldev ai bootstrap --intent=... --json`
- discovery: `ldev portal inventory ...`
- pre-mutation check: `ldev resource import-* --check-only`
- mutation: `ldev resource import-*` / `ldev deploy ...`
- post-mutation verify: read-after-write + `ldev portal check`

See [Agents and MCP](/agentic/) for the full agent contract.

## When the shape does not apply

Not every command fits the loop. `project init`, `worktree setup --with-env`,
`oauth install --write-env`, `ai install` and `ai mcp-setup` are bootstrap
operations — they prepare the environment so the rest of the loop can run.
Treat them as setup, not as steps.
