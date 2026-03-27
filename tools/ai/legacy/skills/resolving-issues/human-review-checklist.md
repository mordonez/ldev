# Human review checklist

- [ ] The original symptom is gone
- [ ] The change is scoped to the intended surface
- [ ] Runtime verification was done with `ldev`
- [ ] There are no new errors in recent logs

```bash
ldev logs --since 5m --no-follow
```
