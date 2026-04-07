# Human Review Checklist

- [ ] The original symptom is gone
- [ ] The change stayed scoped to the intended surface
- [ ] Runtime validation was done with `ldev`
- [ ] No new errors appeared in recent logs
- [ ] If the issue was visual, there is useful evidence for review

```bash
ldev logs --since 5m --no-follow
```
