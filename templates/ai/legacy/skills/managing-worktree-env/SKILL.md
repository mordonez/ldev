---
name: managing-worktree-env
description: "Compatibility wrapper. Use when you need isolated worktree runtime setup, inspection or cleanup. Delegate to /issue-engineering for the full lifecycle."
---

# managing-worktree-env

Use when you need to set up, inspect or tear down an isolated worktree with its
own `ldev` runtime, without running the full issue lifecycle.

For the complete end-to-end issue flow, use `/issue-engineering` instead.

## Create a worktree with an isolated env

```bash
ldev worktree setup --name <name> --with-env
```

`--with-env` provisions a dedicated Docker env for the worktree. Omit it only
if you will reuse the main env (not recommended when changing tracked files).

After setup:

```bash
cd .worktrees/<name>
ldev start
ldev status --json
```

Always run `ldev status --json` after start to confirm the env is healthy before
doing any work.

## Verify env wiring

If you are unsure which env the current worktree is using:

```bash
ldev worktree env --json
```

This returns the env name, container names, port bindings and the database
associated with the worktree. Use it to confirm isolation before deploying.

## Inspect a running worktree

```bash
ldev context --json          # project layout, active services, config
ldev status --json           # container states, health
ldev logs --since 5m --service liferay --no-follow
```

## Recover a broken worktree env

If `ldev status --json` shows degraded or stopped containers:

```bash
ldev env stop
ldev env restore
ldev start
```

If that does not help, inspect the specific env:

```bash
ldev worktree env --json
ldev doctor --json
```

## Remove safely

Only remove after the PR exists and has been merged or closed:

```bash
ldev stop
cd ../..
ldev worktree clean <name> --force
```

`ldev worktree clean` removes the git worktree and the associated Docker env.
`--force` is required to confirm removal of running containers.

## Guardrails

- Do not remove a worktree while a PR is open and may need follow-up changes.
- Do not share env ports between two worktrees running at the same time.
- If `ldev doctor --json` reports a missing dependency after worktree setup,
  run `ldev setup` inside the worktree before `ldev start`.
