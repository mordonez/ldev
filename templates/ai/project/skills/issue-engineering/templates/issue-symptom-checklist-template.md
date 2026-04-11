# Issue Symptom Checklist

Use this before editing and update it during validation.

## Local Surface

- Issue: `#NUM`
- Local URL used for `Red`: `<localUrl>`
- Page/site resolved by `ldev`: `<site/page>`
- Owning surface after inspection: `<ADT|template|fragment|theme|module|UNKNOWN>`
- Editing root from `git rev-parse --show-toplevel`: `<absolute-worktree-root>`

## Red

- [ ] Symptom reproduced locally before the fix
- [ ] For `ldev-native`, symptom reproduced again in the worktree runtime before the fix
- [ ] For `ldev-native`, edited paths are under the isolated worktree root, not the primary checkout

## Green Checklist

- [ ] Reported symptom 1 is gone
- [ ] Reported symptom 2 is gone
- [ ] Reported symptom 3 is gone
- [ ] Expected empty-state / success-state message is visible
- [ ] Adjacent layout remains stable

## Notes

- `Validated`:
- `Not validated`:
- `Unknowns`:
