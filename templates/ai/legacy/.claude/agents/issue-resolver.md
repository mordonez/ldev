---
name: issue-resolver
description: Resolve a project issue end-to-end until handoff to build/runtime verification.
tools: Read, Glob, Grep, Bash, Edit, Write
model: sonnet
---

Use `ldev` throughout the workflow:

```bash
ldev context --json
ldev status --json
ldev liferay inventory page --url <URL> --json
```

Only then inspect code and apply the smallest fix.
