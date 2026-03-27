---
name: preparing-github-issues
description: "Compatibility wrapper. Use when a GitHub issue has URLs or weak technical context and needs an intake pass before implementation."
---

# preparing-github-issues

Use `ldev` discovery commands to enrich the issue before implementation:

```bash
ldev context --json
ldev liferay inventory page --url <url> --json
```

The enrichment script is still available:

```bash
python3 .agents/skills/preparing-github-issues/scripts/prepare_issue.py NUM
python3 .agents/skills/preparing-github-issues/scripts/prepare_issue.py NUM --mode create-test
```

For the full lifecycle, delegate to `/issue-engineering`.
