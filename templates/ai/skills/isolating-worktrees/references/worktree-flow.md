# Worktree Flow

Use this reference for detailed isolated worktree setup, root locking,
inspection, recovery, and cleanup.

## Naming and reuse

- Derive the worktree name from the issue or task in the current session.
- If the user did not provide an issue identifier, derive a short descriptive
  name from the task.
- Do not invent a numeric identifier.
- If the current shell or editor is already inside a worktree, ask the user
  whether to continue there before creating a new one.
- Do not silently switch from the current worktree to a different visible
  worktree.

## Create and start

> **Never use `git worktree add` directly.** `ldev worktree setup` handles
> environment isolation beyond git alone.

For agent-driven runtime-backed work, run these two phases in order — do not
skip ahead to phase 2 before phase 1 is complete.

Before running setup, ask the user: **"Do you need the main environment running
in parallel with the worktree?"**
- Default (no): use `--stop-main-for-clone` only. Main stays stopped, conserving
  resources for the worktree.
- If yes: add `--restart-main-after-clone` so main restarts automatically after
  the clone.

**Phase 1 — from the main checkout:**

```bash
# If not on main, stop and ask the user for --base <ref> before continuing
git branch --show-current
git rev-parse --abbrev-ref origin/HEAD

# Default (main stays stopped):
ldev worktree setup --name <worktree-name> --with-env --stop-main-for-clone

# Only if user confirmed they need main running in parallel:
ldev worktree setup --name <worktree-name> --with-env --stop-main-for-clone --restart-main-after-clone
```

**Phase 2 — from inside the worktree (change directory first):**

```bash
cd .worktrees/<worktree-name>
pwd
git rev-parse --show-toplevel   # must show .worktrees/<worktree-name> before continuing
git status --short
ldev start                      # starts the worktree runtime, NOT main
ldev status --json
```

If `git rev-parse --show-toplevel` does not show a path inside `.worktrees/<worktree-name>`,
stop and ask the user to confirm the working directory before running `ldev start`.

Use plain `ldev worktree setup --name <worktree-name>` only for git-only
worktrees with no isolated runtime.

`--restart-main-after-clone` is optional. Only add it when the user explicitly
confirms they need the main environment running in parallel. Leaving main stopped
is the default because it conserves resources for the worktree runtime.

If the user chose to reuse the current worktree, skip Phase 1. Stay in that
worktree, confirm the root, and continue there instead of creating another one.

If the primary checkout is not on `main`, do not rely on the implicit base
branch. Pass the intended `--base <ref>` explicitly or stop and confirm the
right base branch.

`ldev start` returns when Docker reports the container healthy. Wait for
Liferay startup to finish before portal-facing commands:

```bash
ldev logs --since 2m --no-follow
```

Do not run `ldev portal ...`, `ldev resource ...`, or `playwright-cli` until
logs confirm startup completion.

## Isolation gate

- Creating the worktree is not enough. You must operate from inside it.
- Before the first edit, run `git rev-parse --show-toplevel` and `git status --short` from the same shell/session that will edit files.
- Treat the result as an active edit boundary.
- Re-run the root check after interruptions, shell changes, terminal changes, or directory changes.
- If any tracked file changes appear in the primary checkout after a worktree was required, stop and report the paths instead of moving changes silently.

## Quick inspection

```bash
ldev context --json
ldev logs --since 5m --no-follow
ldev worktree env --json
```

If read-only discovery must target the main runtime while you stay inside the
worktree, prefix commands with `ldev --repo-root <main-root>` instead of
changing directories.

## Recover broken state

```bash
ldev stop
ldev env restore
ldev start
```

## Cleanup

Only after human approval:

```bash
ldev stop
cd ../..
ldev worktree clean <worktree-name> --force
```

Use `ldev worktree clean` instead of deleting `.worktrees/<name>` manually.

## WORKTREE_MAIN_ENV_RUNNING

When `ldev worktree setup --name <worktree-name> --with-env` exits with
`WORKTREE_MAIN_ENV_RUNNING`, the worktree was not created.

Choose exactly one path:

### Path A — Runtime-backed worktree with automatic handoff

Use this when the task needs `ldev portal ...`, `ldev resource ...`, deploys,
or browser validation.

```bash
ldev worktree setup --name <worktree-name> --with-env --stop-main-for-clone --restart-main-after-clone
cd .worktrees/<worktree-name>
git rev-parse --show-toplevel
ldev start
ldev status --json
```

This is the canonical agent path. The `git rev-parse --show-toplevel` after `cd`
is mandatory — it locks the shell to the worktree root before starting the
runtime. Never run `ldev start` from the main checkout to start a worktree
runtime.

### Path B — Git-only worktree

Use this only for file or code edits with no portal interaction.

```bash
ldev worktree setup --name <worktree-name>
cd .worktrees/<worktree-name>
git rev-parse --show-toplevel
git status --short
```

Do not run portal, resource, deploy, logs, or browser commands from a git-only
worktree.

### Path B.1 — Leave main stopped intentionally

Use this only when a human explicitly approves leaving the main checkout down
after cloning runtime state.

```bash
ldev worktree setup --name <worktree-name> --with-env --stop-main-for-clone
cd .worktrees/<worktree-name>
ldev start
ldev status --json
```

### Path C — Stay in the worktree, discover through the main checkout

Use this only for read-only discovery when the main runtime is still the source
of truth.

```bash
ldev --repo-root <main-root> portal inventory sites --json
ldev --repo-root <main-root> portal inventory page --url /web/guest/home --json
ldev --repo-root <main-root> ai bootstrap --intent=develop --cache=60 --json
```