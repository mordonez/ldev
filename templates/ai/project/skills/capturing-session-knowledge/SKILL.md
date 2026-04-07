---
name: capturing-session-knowledge
description: "Use when a working session produced verified knowledge that should become project-owned documentation."
---

# capturing-session-knowledge

Use this skill to write verified knowledge back into project-owned docs.

Target files:

- `docs/ai/project-context.md` for stable project knowledge (primary target for both project types)
- `CLAUDE.md` for short agent-routing notes that stay project-owned (ldev-native only; blade-workspace uses `docs/ai/project-context.md` instead)
- `.agents/skills/project-*` for project-specific procedures

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
