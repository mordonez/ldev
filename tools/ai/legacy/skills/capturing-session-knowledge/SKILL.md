---
name: capturing-session-knowledge
description: "Use when a working session produced verified knowledge that should become project-owned documentation."
---

# capturing-session-knowledge

Use this skill to write verified knowledge back into project-owned docs.

Target files:

- `AGENTS.md` for project-wide agent policy
- `CLAUDE.md` for stable project knowledge
- `.agents/skills/<project>-*` for project-specific procedures

Anchor runtime and portal facts in tool output:

```bash
ldev context --json
ldev liferay inventory sites --json
ldev liferay inventory pages --site /<site> --json
ldev liferay inventory page --url /web/<site>/<friendly-url> --json
```
