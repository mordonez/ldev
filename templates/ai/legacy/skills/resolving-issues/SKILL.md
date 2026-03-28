---
name: resolving-issues
description: "Compatibility wrapper. Use when the prompt still says resolving-issues. Delegate to /issue-engineering."
---

# resolving-issues

Compatibility alias for `/issue-engineering`.

Keep these guardrails:

- use `ldev worktree setup ...` before editing
- use `ldev liferay inventory ...` before guessing portal state
- use `ldev deploy ...`, `ldev osgi ...` and `ldev logs ...` for runtime validation
- do not clean a worktree before a verifiable PR exists
