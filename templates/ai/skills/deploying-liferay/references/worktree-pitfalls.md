# Worktree Pitfalls

Use this reference when deploy or startup fails only in isolated worktrees and not in `main`.

## Common patterns

- Incomplete local worktree configuration
- Port or absolute URL resolution problems
- Partially restored environment state
- Prepared artifacts not being reused as expected

## Quick checks

```bash
ldev context --json
ldev status --json
ldev logs --since 5m --no-follow
ldev worktree env --json
```

## What to inspect

- That you are inside the correct worktree
- That the port and `portalUrl` match that environment
- That the problem is not caused by incomplete restore or corrupted local data

## Guardrails

- Do not delete the worktree manually
- Do not assume a worktree-only failure implies a code bug
- If the environment itself is broken, switch to `troubleshooting-liferay`
