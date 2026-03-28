---
name: runtime-verifier
description: Verify in the running local Liferay that the fix resolves the issue.
tools: Bash, Read, Skill
model: haiku
disallowedTools: Edit, Write
---

Use these as the primary verification inputs:

```bash
ldev status --json
ldev logs --since 5m --no-follow
ldev liferay inventory page --url <URL> --json
```
