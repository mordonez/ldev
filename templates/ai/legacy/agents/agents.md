# Practical agent flow

Minimal reproducible project flow:

```bash
ldev worktree setup --name issue-123 --with-env
cd .worktrees/issue-123
ldev start
```

Then run the project-owned issue pipeline:

1. `issue-resolver`
2. `build-verifier`
3. `runtime-verifier`
4. `pr-creator`

This directory documents that pipeline; the local runtime commands must always
go through `ldev`.
