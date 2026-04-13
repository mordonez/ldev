---
name: capturing-session-knowledge
description: "Use at the end of a session to save learnings that prevent future mistakes and improve efficiency."
---

# capturing-session-knowledge

Use this skill to distil what the session revealed that a fresh agent should
know before starting the next one. The goal is to avoid repeating mistakes and
to carry forward project-specific knowledge that is not obvious from the code.

## Mental model

Ask: _"What would I tell a fresh agent at the start of the next session to make
it faster and avoid the same traps?"_

Not: _"What did we do in this session?"_ — that belongs in commits and PRs.

## Target file

Write only to `docs/ai/project-learnings.md`.

This file is listed in the agent entrypoint files under **Read Next**, so every
session loads it automatically.

Never save durable knowledge only in `.tmp`, editor workspace storage, chat
session resources, or any other transient location. It must land in
`docs/ai/project-learnings.md` so the next session can read it.

Create the file if it does not exist yet:

```markdown
# Project Learnings

Project-specific learnings captured from agent sessions.
Each entry is an atomic, actionable insight to avoid past mistakes.
```

## What to capture

Each entry must be atomic and actionable:

- **Errors with a known cause** — something that failed and why, so it is not
  retried blindly (e.g. "gradle deployFast fails on this module because X; use
  blade deploy instead").
- **Non-obvious working patterns** — what to do instead of the intuitive
  approach (e.g. "clearing OSGi cache is required after changing a
  portlet-model-hints.xml").
- **Project constraints discovered at runtime** — gotchas not visible in the
  code (e.g. "this workspace has two active nodes; changes must be deployed to
  both").
- **Efficiency shortcuts** — sequences or flags that save significant time.

## What NOT to capture

- The narrative of how an issue was resolved — that belongs in the commit
  message or PR description.
- Facts derivable on demand from `ldev context --json` or similar commands.
- Temporary workarounds that should become permanent code fixes.
- Issue-specific state (task IDs, branch names, specific file paths changed).
- Stable project structure or conventions — those belong in
  `docs/ai/project-context.md`.

## Format

One learning per section. Lead with the **situation** that triggers the rule,
then the **action** or **fact**. Keep each entry to 1–3 lines.

```markdown
## <short label>
<When / situation>: <what to do or know>.
```

Example:

```markdown
## OSGi cache after portlet-model-hints change
After editing portlet-model-hints.xml, clear the OSGi cache before deploying
or the change will not take effect: run `ldev osgi:clear-cache` then redeploy.
```

Do not write more than 5–6 new entries per session. Fewer, sharper entries are
more useful than an exhaustive log.
