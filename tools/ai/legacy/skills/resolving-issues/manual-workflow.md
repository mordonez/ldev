# Manual issue workflow

```bash
ldev worktree setup --name issue-NUM --with-env
cd .worktrees/issue-NUM
ldev start
```

Then:

1. reproduce the bug
2. inspect portal state with `ldev liferay inventory ...`
3. apply the smallest fix
4. deploy with `ldev deploy ...`
5. verify with `ldev osgi ...`, `ldev logs ...` and the affected URL
