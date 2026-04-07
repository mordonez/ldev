# Worktree Env

Operational reference for preparing, inspecting, and cleaning the isolated environment of an issue.

## Create and Start

```bash
ldev worktree setup --name issue-NUM --with-env
cd .worktrees/issue-NUM
pwd
git rev-parse --show-toplevel
ldev start
ldev status --json
```

`ldev start` returns as soon as Docker reports the container healthy (Tomcat up). Liferay still needs time to finish deploying bundles from the cache. Wait for the startup sequence to complete before using the portal:

```bash
ldev logs --since 2m --no-follow | grep -i "startup\|Server startup\|STARTED"
```

Do not run `ldev portal ...`, `playwright-cli`, or any portal-facing tool until that output confirms Liferay has finished its startup sequence.

## Isolation Gate

- Do not continue if `pwd` or `git rev-parse --show-toplevel` does not point to the expected worktree
- Do not run `ldev portal ...`, `ldev resource ...`, or `playwright-cli` until:
  1. `ldev status --json` confirms the container is healthy, AND
  2. logs confirm Liferay finished its startup sequence (see above)

## Quick Inspection

```bash
ldev context --json
ldev logs --since 5m --no-follow
ldev worktree env --json
```

## Recover Broken State

```bash
ldev stop
ldev env restore
ldev start
```

## Cleanup

Only after a verifiable PR exists:

```bash
ldev stop
cd ../..
ldev worktree clean issue-NUM --force
```

## Notes

- `ldev worktree clean` is destructive; do not replace it with `rm -rf`
- If the guardrail warns that `main` is still running without Btrfs, ask for confirmation before touching it
- If `ldev worktree setup --with-env` fails in preflight before creating the worktree, treat that as expected safety behavior, not as a partial success
