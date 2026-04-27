# Specialized Diagnosis Paths

Use this reference for troubleshooting branches that are important but only
apply to specific incident shapes.

## Isolated worktree troubleshooting

Use `isolating-worktrees` for the canonical setup, root lock, recovery, and cleanup flow.

When a risky fix or a production-like reproduction should not share runtime
state with the main checkout, isolate it:

```bash
ldev worktree setup --name incident-<id> --with-env --stop-main-for-clone --restart-main-after-clone
cd .worktrees/incident-<id>
ldev start
ldev status --json
```

If a human explicitly wants the main checkout left stopped after cloning, use:

```bash
ldev worktree setup --name incident-<id> --with-env --stop-main-for-clone
```

Use a worktree when:

- one branch is reproducing an incident and another is active development
- a migration or reproduction needs its own local DB or mounted file state
- you need to compare behavior across branches without mixing runtime state

## Reindex incidents

References:

- `references/reindex-after-import.md`
- `references/reindex-journal.md`

```bash
ldev portal reindex status --json
ldev portal reindex tasks --json
ldev portal reindex watch --json
```

Enable temporary speedup only while an actual reindex is active:

```bash
ldev portal reindex speedup-on
ldev portal reindex speedup-off
```

## Search and buscadores

Reference: `references/search-debug.md`

Covers search widgets returning 0 results, filter widgets not working,
persistent visual bugs such as a hidden "Limpiar" button, and guest versus
authenticated result differences.

## Content version accumulation or empty language versions

Reference: `references/content-versions.md`

Covers excessive version history, empty linguistic versions added by bulk sync
processes, and Groovy-based cleanup workflows.

## Environment lifecycle and recovery

When basic `ldev start` / `ldev stop` are not enough:

```bash
# Restart only the liferay service (faster than full stop/start)
ldev env restart
ldev env restart --timeout 300

# Full container recreation (destroys and recreates docker resources)
ldev env recreate

# Wipe local docker resources and bind-mounted runtime data (destructive)
ldev env clean --force

# Restore runtime data from main checkout or BTRFS_BASE snapshot
ldev env restore

# Wait for health in scripts or after a restart
ldev env wait --timeout 300

# Scriptable health check (exits 1 if unhealthy)
ldev env is-healthy --json

# Compare current environment against a saved baseline
ldev env diff --json
ldev env diff --write-baseline   # save current state as new baseline
```

Use `ldev env clean --force` only as a last resort — it removes all local
runtime data. Use `ldev env restore` first when the goal is to reset to a
known good state.

## Emergency SQL diagnosis

When portal APIs are unavailable or return inconsistent results, query the
database directly:

```bash
# Inline query
ldev db query "SELECT * FROM JournalArticle WHERE groupId = <groupId> LIMIT 10"

# From a file
ldev db query --file /path/to/diagnostic.sql
```

Use `ldev db query` for read-only diagnosis. For any mutating SQL, confirm
explicitly with the developer before executing. Always scope queries with
`WHERE` or `LIMIT` to avoid locking or performance issues on large tables.