# Worktree Flow (ldev-native)

Use this reference when deciding whether to isolate work in a worktree, setting
one up, or cleaning up after resolution.

## When to use a worktree vs. working on the main checkout

Use a worktree when:

- An active incident needs its own runtime state (DB, Document Library mount,
  portal config) separate from ongoing development.
- A migration or reproduction requires a production-like DB import that should
  not pollute the shared local environment.
- You need to compare behavior across branches without switching branches in the
  main checkout while services are running.
- A risky change (schema migration, config change) should be validated in
  isolation before landing in `main`.

Stay on the main checkout when:

- The fix is purely code or resource changes with no runtime state dependency.
- No concurrent development is happening that would be disrupted by a branch
  switch.

## Setup

```bash
# Create a worktree with its own isolated runtime environment
ldev worktree setup --name <worktree-name> --with-env

# Enter the worktree
cd .worktrees/<worktree-name>

# Start the isolated runtime
ldev start
ldev status --json
```

`--with-env` provisions an isolated Docker environment (separate DB, separate
portal data volume, separate port allocation) for the worktree. It does **not**
copy or mount Document Library files — if the reproduction requires DL content,
mount it explicitly after setup:

```bash
ldev db files-mount --path /path/to/doclib
```

## Naming conventions

Use names that link the worktree to a traceable unit of work:

| Pattern | When to use |
|---|---|
| `incident-<id>` | Production incident tied to a ticket or issue number |
| `feat-<id>` | Feature branch that needs isolated runtime validation |
| `repro-<description>` | Standalone reproduction without a ticket number |

Avoid generic names like `test` or `debug` — they make it hard to identify
stale worktrees later.

## Inspect a worktree environment

```bash
# From inside the worktree directory
ldev worktree env --json
ldev context --json
ldev status --json
```

## Cleanup after resolution

```bash
# From inside the worktree directory — stop the isolated runtime first
ldev stop

# From the main checkout — remove the worktree and its environment
ldev worktree clean <worktree-name> --force
```

`ldev worktree clean` removes the worktree directory and cleans the isolated
runtime data owned by that worktree. It does **not** remove:

- Any Document Library paths you mounted manually with `ldev db files-mount`
- Any local backup files downloaded with `ldev db files-download`
- The git branch associated with the worktree unless `--delete-branch` is used

Clean those up manually after confirming the worktree is removed:

```bash
# Remove the manually mounted DL path if no longer needed
rm -rf /path/to/doclib

# Delete the branch if the work is merged or abandoned
git branch -d <worktree-name>
```

## Guardrails

- Prefer `ldev stop` inside the worktree before running `ldev worktree clean`
  from the main checkout. Removing a worktree with a running env can leave
  orphaned containers.
- Do not delete `.worktrees/<name>` manually — use `ldev worktree clean` so
  the Docker environment is cleaned up alongside it.
- If a worktree env is broken and `ldev stop` fails, stop the containers
  directly with `ldev worktree env --json` to identify them, then remove via
  `ldev worktree clean <name> --force`, or stop containers manually
  before removing the directory.
