# Human Review Checklist

- [ ] The issue was reproduced locally before the fix
- [ ] For `ldev-native`, the issue was reproduced again in the worktree runtime before the fix
- [ ] The owning page/resource was resolved through `ldev` before broad code search
- [ ] The original symptom checklist is fully green
- [ ] The change stayed scoped to the intended surface
- [ ] Runtime validation was done with `ldev`
- [ ] No new errors appeared in recent logs
- [ ] If the issue was visual, there is useful local evidence for review
- [ ] The handoff clearly lists `Validated`, `Not validated`, and `Unknowns`

```bash
ldev logs --since 5m --no-follow
```
