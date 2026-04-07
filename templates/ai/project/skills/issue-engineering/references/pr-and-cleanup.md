# PR and Cleanup

Short reference for disciplined issue closure.

## Commit and PR

```bash
git add <specific-files>
git commit -m "fix(scope): description (#NUM)"
git push origin fix/issue-NUM
gh pr create --title "fix(scope): description (#NUM)" --body $'Closes #NUM\n\n...'
```

## Minimum PR Body

- First line: `Closes #NUM` or `Fixes #NUM`
- What the fix does
- How to verify it step by step
- Deployment notes if the change requires import or migration outside local
- Visual evidence if the issue was UI

## Comment Back on the Issue

```bash
gh issue comment NUM --body "Fix in PR #<NUM>. [link to evidence]"
```

## Cleanup

Only after the PR:

```bash
ldev stop
cd ../..
ldev worktree clean issue-NUM --force
```
