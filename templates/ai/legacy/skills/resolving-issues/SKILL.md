---
name: resolving-issues
description: "Compatibility wrapper. Use when the prompt still says resolving-issues. Delegate to /issue-engineering."
---

# resolving-issues

Compatibility alias for `/issue-engineering`.

`issue-engineering` is the canonical skill for the full issue lifecycle and is
now part of the standard `ldev` vendor surface. It is installed at
`.agents/skills/issue-engineering/SKILL.md` when you run `ldev ai install`.

Use `/issue-engineering` for all new work.

## Guardrails (inherited)

These rules apply whether you use this alias or the canonical skill:

- Use `ldev worktree setup --name issue-NUM --with-env` before editing tracked files.
- Run `ldev liferay inventory ...` before guessing portal state, IDs or keys.
- Verify all changes with `ldev deploy ...`, `ldev osgi ...` and `ldev logs ...`
  against the running runtime.
- Do not clean a worktree before a verifiable PR exists.
