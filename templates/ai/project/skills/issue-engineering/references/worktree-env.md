# Worktree Env

Operational reference for preparing, inspecting, and cleaning the isolated environment of an issue.

Use this reference only when the repository actually has `ldev-native`
worktree capabilities available.

## Create and Start

> **Never use `git worktree add` directly.** `ldev worktree setup` is required — it handles
> environment isolation, database copying, and Btrfs snapshots beyond what git provides alone.

```bash
git branch --show-current
git rev-parse --abbrev-ref origin/HEAD
ldev worktree setup --name issue-NUM --with-env --base main
cd .worktrees/issue-NUM
pwd
git rev-parse --show-toplevel
ldev start
ldev status --json
```

When you run `ldev worktree setup` from a non-`main` branch in the primary checkout,
the new worktree branches from that current HEAD by default. Do not rely on that
implicit behavior. If the primary checkout is not on `main`, pass the intended
`--base <ref>` explicitly or stop and ask for the validated base branch.

`ldev start` returns as soon as Docker reports the container healthy (Tomcat up). Liferay still needs time to finish deploying bundles from the cache. Wait for the startup sequence to complete before using the portal:

```bash
ldev logs --since 2m --no-follow
```

Do not run `ldev portal ...`, `playwright-cli`, or any portal-facing tool until
the output confirms Liferay has finished its startup sequence. Look for startup
markers such as `Server startup` or `STARTED`. On Windows, use `Select-String`
if you need to filter the output.

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

For issue work that starts from a URL, this inspection must be followed by:

```bash
ldev portal inventory page --url <localUrl> --json
```

Do not start repo-wide grep or code edits until the worktree runtime has loaded
the target page and you have identified the concrete page/resource to change.

## Recover Broken State

```bash
ldev stop
ldev env restore
ldev start
```

## Cleanup

Only after a human has validated the work and explicitly approved cleanup:

```bash
ldev stop
cd ../..
ldev worktree clean issue-NUM --force
```

## WORKTREE_MAIN_ENV_RUNNING — Recovery Decision

When `ldev worktree setup --name <name> --with-env` exits with
`WORKTREE_MAIN_ENV_RUNNING`, the worktree was **not created**.
Do not proceed as if a partial setup succeeded.

Choose exactly one path and follow it completely:

### Path A — Stop main, then retry with `--with-env` (preferred)

Use this when you need portal commands (`ldev portal ...`, `ldev resource ...`,
deploy, browser validation) as part of the issue workflow.

```bash
ldev stop                                    # from the main checkout
ldev worktree setup --name issue-NUM --with-env
cd .worktrees/issue-NUM
ldev start
ldev status --json
```

Do not continue past `ldev start` until `ldev status --json` confirms the
container is healthy and logs confirm Liferay finished its startup sequence.

### Path B — Git-only worktree, no runtime

Use this only when the task is **purely code or file edits** with no portal
interaction required.

```bash
ldev worktree setup --name issue-NUM        # no --with-env
cd .worktrees/issue-NUM
git rev-parse --show-toplevel               # confirm you are inside the worktree
```

**Hard stop after this.** A git-only worktree has no runtime. Do NOT run:
- `ldev resource ...`
- `ldev portal ...`
- `ldev deploy ...`
- `ldev logs ...`
- any browser validation

If the task later requires portal access, exit Path B, go back to the main
checkout, stop the main env, and restart from Path A.

---

## Notes

- `ldev worktree clean` is destructive; do not replace it with `rm -rf`
- If `ldev worktree setup --with-env` fails in preflight before creating the worktree, treat that as expected safety behavior, not as a partial success — pick Path A or Path B above, do not improvise a hybrid
