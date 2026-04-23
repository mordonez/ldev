---
name: troubleshooting-liferay
description: 'Use when the local Liferay runtime is failing, unhealthy or behaving incorrectly and the cause is not yet clear.'
---

# Troubleshooting Liferay

Use this skill for diagnosis first, not for speculative fixes.

It is also the reusable home for local reproduction workflows when the issue
depends on production-like data or isolated worktree state.

## Required bootstrap

```bash
ldev ai bootstrap --intent=troubleshoot --json
```

This returns `context` plus targeted doctor checks and readiness.
Inspect:

- `context.commands.*` — supported command namespaces and missing requirements.
- `context.liferay.auth.oauth2.*.status` — configured credentials, not proof of validity.
- `doctor.checks[]` — active failures and remedies.
- `doctor.readiness.*` — command-level readiness.

If the env is not running, start it before deeper analysis:

```bash
ldev start
```

## Bootstrap fields

- Required fields: `context.commands.*`, `context.liferay.portalUrl`,
  `context.liferay.auth.oauth2.*.status`, `doctor.checks[]`, `doctor.readiness.*`.
- If any of those fields is missing, stop and report that the installed `ldev`
  AI assets are out of sync with the CLI.

## Core diagnosis flow

### Runtime health and logs

```bash
ldev status --json
ldev logs diagnose --since 10m --json
```

Use raw logs only after the diagnosis report points to something that needs
deeper inspection:

```bash
ldev logs --since 10m --service liferay --no-follow
```

### Bundle and OSGi issues

```bash
ldev osgi status <bundle-symbolic-name> --json
ldev osgi diag <bundle-symbolic-name> --json
```

For a hanging or slow portal, collect a thread dump:

```bash
ldev osgi thread-dump
```

### Portal discovery issues

If a page, site, structure or template is involved, resolve it from the portal:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory structures --site /<site> --with-templates --json
ldev portal inventory templates --site /<site> --json
```

For structure/template incidents, treat `--with-templates` as the default
discovery path to avoid separate lookup rounds.

### Production reproduction

When the issue does not reproduce with clean local data, bring production-like
state into the local environment before guessing:

```bash
ldev db sync --environment <env> --project <lcp-project> --force
```

If you already have a local backup file:

```bash
ldev db import --file /path/to/backup.sql.gz --force
```

When the issue depends on Document Library files:

```bash
ldev db files-download --environment <env> --project <lcp-project> --doclib-dest docker/doclib/<env>
ldev db files-mount --path docker/doclib/<env>
```

If the files are not coming from Liferay Cloud, mount the prepared local path:

```bash
ldev db files-mount --path /path/to/manual/doclib
```

Then restart the local diagnosis loop:

```bash
ldev start
ldev doctor --json
ldev portal inventory sites --json
ldev logs diagnose --since 15m --json
```

### Post-import content volume

After importing a production database, Journal content volume may be too large
for practical local reindexing or day-to-day use.

Check content volume per site before reindexing:

```bash
ldev portal inventory sites --with-content --sort-by content
```

Scope to one site for folder-level detail:

```bash
ldev portal inventory sites --site /<site> --with-structures --limit 20
```

If volume is too high, preview a prune first:

```bash
ldev portal content prune \
  --group-id <groupId> \
  --root-folder <folderId> \
  --keep 100 \
  --dry-run
```

Review the dry-run output (`articleCount`, `keptCount`, `deletedCount`,
`Breakdown by structure`) before applying. Run without `--dry-run` only when
the plan is correct.

Use `--keep-scope structure` when you want to retain N most recent articles per
structure type across all selected folders instead of per folder.

### Isolated worktree troubleshooting

Reference: `references/worktree-flow.md`

When a risky fix or a production-like reproduction should not share runtime
state with the main checkout, isolate it:

```bash
ldev worktree setup --name incident-<id> --with-env
cd .worktrees/incident-<id>
ldev start
ldev status --json
```

On non-Btrfs setups where the main environment is already running, use the
handoff flags only when the team approved that stop/restart flow:

```bash
ldev worktree setup --name incident-<id> --with-env --stop-main-for-clone
ldev worktree setup --name incident-<id> --with-env --stop-main-for-clone --restart-main-after-clone
```

Use a worktree when:

- one branch is reproducing an incident and another is active development
- a migration or reproduction needs its own local DB or mounted file state
- you need to compare behavior across branches without mixing runtime state

### Reindex issues

References:

- `references/reindex-after-import.md`
- `references/reindex-journal.md`

### Search and buscadores not working

Reference: `references/search-debug.md`

Covers: search widget returning 0 results, filter widgets (category/tag) not
working, persistent visual bugs such as a hidden "Limpiar" button, and guest
vs. authenticated result differences.

### Content version accumulation or empty language versions

Reference: `references/content-versions.md`

Covers: articles with excessive version history, empty linguistic versions
added by bulk sync processes, and Groovy-based bulk version cleanup.

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

## Recovery actions

Use these only when diagnosis points to broken local runtime state:

Reference:

- `references/ddm-migration.md`

```bash
ldev stop
ldev env restore
ldev start
```

If the issue is isolated to a worktree env, inspect it explicitly:

```bash
ldev worktree env --json
```

## Guardrails

- Do not jump straight to rebuild or clean unless logs and status suggest local state corruption.
- Do not assume a portal API problem when the env is simply down; `ldev status --json` is the first check.
- Do not parse human text if a stable JSON variant exists.
- Prefer `ldev logs diagnose --json` as the first diagnosis surface; use raw logs as a follow-up tool.
- If the issue depends on production data, reproduce that state locally before proposing fixes.
- If isolation matters, prefer `ldev worktree setup --with-env` over ad hoc branch switching.
- If a worktree needs read-only discovery against the main runtime, use `ldev --repo-root <main-root> ...` instead of changing directories.
- After finding the root cause, switch to `developing-liferay` or `deploying-liferay` for the actual fix path.
