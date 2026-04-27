---
name: capturing-session-knowledge
description: "Use when a working session produced verified knowledge that should become project-owned documentation."
---

# capturing-session-knowledge

Use at the end of a session to write verified knowledge into the project's
permanent documentation so future agents and humans can rely on it.

Do not capture speculative information. Only write down facts that were confirmed
by running `ldev` commands or observing the real runtime in this session.

## When to run

Run after any session that produced one or more of these:

- a new confirmed `ldev` command or flag that the project docs did not mention
- a discovered portal surface (site, structure key, template ID, fragment key,
  ADT display style) that is not yet recorded
- a project-specific deploy or import path that differs from the defaults
- a runtime quirk or caveat (database state, env config, port mapping) that
  affected the work and will affect future sessions
- a workflow step that is specific to this project and not in vendor skills

## Anchor all facts with ldev output

Before writing, re-run the commands that produced the verified output to confirm
the facts are still current:

```bash
ldev context --json
ldev status --json
ldev liferay inventory sites --json
ldev liferay inventory pages --site /<site> --json
ldev liferay inventory page --url /web/<site>/<friendly-url> --json
ldev liferay inventory structures --site /<site> --json
ldev liferay inventory templates --site /<site> --json
```

Never write IDs, keys or site paths from memory. Copy them from the current
command output.

## What goes where

| Type of knowledge | Target file |
|---|---|
| Project-wide agent policy (worktree rule, deploy rule, branch convention) | `AGENTS.md` |
| Stable project facts (stack versions, layout paths, naming conventions) | `CLAUDE.md` |
| Portal surfaces (site names, structure keys, template IDs, ADT names) | `CLAUDE.md` → structured content section |
| Project-specific deploy or import workflow that differs from vendor defaults | `.agents/skills/<project>-<surface>.md` |
| Project-specific troubleshooting step (specific to this repo's env) | `.agents/skills/<project>-troubleshooting.md` |

## Format for CLAUDE.md additions

When adding a portal surface, use a table and include the discovery command:

```markdown
## Discovered surfaces — <site>

| Type | Key / ID | Description |
|---|---|---|
| Structure | <STRUCTURE_KEY> | <what it maps to> |
| Template | <TEMPLATE_ID> | <template purpose> |
| ADT | ddmTemplate_<ID> | <ADT display purpose> |
| Fragment | <fragment-key> | <fragment purpose> |

Verified with: `ldev liferay inventory page --url <url> --json`
```

## Format for new project skills

If the knowledge is a repeatable workflow:

```markdown
---
name: <project>-<workflow>
description: "Use when <specific trigger for this project>."
---

# <Workflow Title>

## Context

<what ldev commands confirmed this workflow is necessary>

## Steps

<numbered steps using only ldev commands>

## Verification

<ldev commands to confirm the workflow succeeded>
```

## Guardrails

- Do not duplicate content that is already in vendor skills.
- Do not write knowledge that is only valid for the current session state.
- If the knowledge belongs in a vendor skill, note it for the `ldev` maintainer
  instead of writing it only in project docs.
- Keep `CLAUDE.md` sections short. Move step-by-step procedures to skills.
