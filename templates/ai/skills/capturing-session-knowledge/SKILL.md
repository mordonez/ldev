---
name: capturing-session-knowledge
description: "Use when a working session produced verified knowledge that should become project-owned documentation."
---

# capturing-session-knowledge

Use this skill to write verified knowledge back into project-owned docs.

Target files:

- `docs/ai/project-context.md` for stable project knowledge (primary target for both project types)
- `.workspace-rules/project-session-knowledge.md` for short project-owned agent rules that must be read by every tool
- `CLAUDE.md` for short agent-routing notes that stay project-owned (ldev-native only; blade-workspace uses `docs/ai/project-context.md` instead)
- `.agents/skills/project-*` for project-specific procedures

Never save durable knowledge only in `.tmp`, editor workspace storage, chat
session resources, or another generated/transient directory. Temporary notes may
help while investigating, but the final captured knowledge must land in one of
the project-owned files above so the next agent session can read it.

Use `.workspace-rules/project-session-knowledge.md` when the knowledge is a
compact operational rule such as "for this project, use this local URL pattern"
or "this Playwright login sequence is required." Use `docs/ai/project-context.md`
when the knowledge needs context, history, or a longer explanation.

Anchor runtime and portal facts in tool output:

```bash
ldev context --json
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url /web/<site>/<friendly-url> --json
```

## What to capture

- Verified portal entity keys, site friendly URLs, structure/template IDs
- Worktree environment pitfalls discovered during a session
- OSGi bundle symbolic names for project modules
- Playwright patterns that work for the project's login/admin flows
- Deploy sequences that were non-obvious or required troubleshooting

## What NOT to capture

- Content derivable from `ldev context --json` at any time
- Temporary workaround steps that should become permanent fixes
- Individual issue resolutions (those belong in commits and PRs)
