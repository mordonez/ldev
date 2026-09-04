---
title: Why ldev Exists
description: ldev is not an AI tool. It is a fix for a systems problem in Liferay — and the AI integration is a consequence, not the goal.
---

# Why ldev Exists

`ldev` is not an AI tool.

It is a fix for the systems problem that Liferay has accumulated over the
years — operations that only live in the admin UI, environments that are
hard to reproduce, no scripted way to migrate content, no workflow
conventions for parallel work. `ldev` cleans up that surface.

The interesting part is what falls out of the cleanup.

## Humans and agents struggle for the same reasons

If you watch a developer working on Liferay, the friction is concrete:

- "I want to import this structure but it is admin-panel only."
- "Someone else is using the local env, I cannot debug."
- "We changed a structure and the existing articles cannot be migrated
  cleanly."
- "I cannot diff what I am about to deploy against what is live."
- "I would script this, but the output is human-readable text."

Every one of those is also a wall for an AI agent. The agent cannot click
the admin panel. It cannot share a single mutable runtime. It cannot
invent a migration path that does not exist. It cannot parse human-only
output reliably.

The same friction. Different consumer.

## What "fixing the system" looks like in practice

`ldev` does five concrete things, and each one is a classic
developer-experience move that happens to also unblock agents:

### Reproducible environments

```bash
ldev project init ~/projects/my-project
cd ~/projects/my-project
ldev start --activation-key-file /path/to/activation-key.xml
ldev oauth install --write-env
ldev oauth admin-unblock
```

A working Liferay from zero, one chain of commands. A new team member
runs it and is set up. An agent runs it and has somewhere to work.
Reproducibility is the prerequisite for everything else.

### Isolated runtimes per branch

```bash
ldev worktree setup --name incident-123 --with-env
cd .worktrees/incident-123
ldev start
```

Each branch with its own Postgres, Liferay and OSGi state. A developer
gets to debug a production incident without blocking the rest of the
team. An agent gets a sandbox per task — the natural unit of work for a
"one issue, one PR" loop.

### Guardrails before mutation

```bash
ldev resource import-structure --file ... --check-only
ldev resource import-structure --file ...
```

`--check-only` previews the change. The mutation happens only after the
preview is reviewed. Then read-after-write verifies the result. A
developer in a hurry benefits the same way an agent does — neither can
afford silent corruption.

### Operations as data

```bash
ldev resource export-structure --site /global --structure MY_STRUCTURE
# review the file in Git
ldev resource import-structure --file path/to/MY_STRUCTURE.json
```

Structures, templates, ADTs and fragments turned into reviewable files.
A developer gets a Git diff instead of a UI form. An agent gets a file
it can read, modify and write back. Same artifact, two consumers.

For structure changes against existing content, the same model
generalises into a declarative workflow: `migration-pipeline` reads a
JSON descriptor that describes the change. The descriptor lives in Git;
the pipeline runs it. Both humans and agents can write the descriptor;
both can run the pipeline.

### A single surface for humans, scripts and agents

Every command that returns data supports `--json`. Every error has a
stable code. The same surface is consumed by agent skills that wrap the
same `ldev` workflows.

A developer reads the output. A CI pipeline pipes it to `jq`. An agent
uses a skill that calls the same command. Three consumers, one contract.

## Why the agent layer works

There is no separate "AI part" of `ldev`. The `AGENTS.md` install and
the project skills — all of that is wiring on top of the same workflows
the CLI already exposes. They are useful because the underlying surface
was already clean.

That is the order of operations:

1. The systems problem in Liferay creates friction for humans.
2. Fixing the friction means making operations explicit, environments
   reproducible, mutations safe and outputs structured.
3. Once those things are true, agents can use the same surface — because
   the things they need are the same things humans needed.

This matches the broader thesis that
[good AI integration is a systems problem](https://www.augmentcode.com/blog/ai-transformation-is-a-systems-problem),
not an AI feature problem. `ldev` is the application of that thesis to
Liferay specifically.

## Doesn't better browser automation change this?

Agents that drive a real browser (Claude in Chrome, Playwright MCP
servers, and similar) have gotten a lot more capable. It's a fair
question whether that erodes `ldev`'s reason to exist — if an agent can
just click through the admin panel now, why script anything?

It doesn't, for the same reason a human wouldn't trade a REST call for a
form-filling macro:

- **One HTTP call vs. many round trips.** `ldev resource export-structures
  --site /global` reads every structure on a site in one command. The
  same task through the UI is: open the page, wait for it to render,
  click into each structure, screenshot or read the DOM, repeat per
  structure. The gap gets worse, not better, as the number of items
  grows — batch operations are `ldev`'s home turf.
- **A file, not a screenshot.** Exporting a structure produces a JSON
  file that lands in Git, gets a real diff, and can be reviewed in a PR.
  A browser session driving the same admin form produces nothing
  durable once the tab closes — there is no artifact to hand to the next
  step of a workflow, human or agent.
- **Structured data vs. rendered UI.** `ldev portal inventory` /
  `api discover` return exact JSON straight from the Headless REST APIs.
  A browser-driving agent reading the same information off a rendered
  Control Panel page is parsing a UI that was designed for a human eye,
  not a stable contract — a copy change or a layout shift is a script
  failure waiting to happen.
- **It's not always a browser problem.** `ldev start`, `doctor`, `deploy`,
  `worktree`, and the Gogo/OSGi diagnostics operate on Docker, git, the
  local filesystem, and a container's process — none of that is reachable
  from a browser tab at all, however capable the agent driving it is.

None of this makes browser automation useless — it makes it the right
tool for a narrower job than the one it's being asked about here.
`ldev`'s own [browser-testing skill](https://github.com/mordonez/ldev/blob/main/skills/automating-browser-tests/SKILL.md)
already scopes browser automation to exactly that job: visual
regressions, page-editor mutations with no headless equivalent, login
flows, mobile viewports — the things that are genuinely about what
renders, not about reading or writing data. `ldev verify page` covers
the scriptable, CI-friendly slice of that same need (screenshot, console
errors, DOM checks after a change) without requiring a live interactive
agent session to run it.

The rule of thumb: if the task is "get or change some data," reach for
`ldev` and a headless API call. If the task is "does this look right
when it renders," reach for a browser.

## What this changes about how to read the rest of the docs

When you see `ldev` capabilities documented later — resource ops,
worktrees, migration, agent workflows — read them as instances of the same idea.
Each one removes a piece of system-level friction. Each one is useful
for humans first. The agent benefit comes along for the ride.

That is why `ldev` is small in scope on purpose. It is not trying to be
a generic Liferay CLI. It is trying to clean up a specific surface so
that the people and the agents working on it stop tripping over the
same things.

## Where to go next

- [What is ldev](/getting-started/what-is-ldev) — the practical
  one-pager.
- [Operations Model](/core-concepts/operations) — the shape every
  workflow follows.
- [Export and Import Resources](/workflows/export-import-resources) —
  the flagship workflow.
- [Agent workflows](/agentic/) — what the cleaned-up surface looks like
  from the agent side.
