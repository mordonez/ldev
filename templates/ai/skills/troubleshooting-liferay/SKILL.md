---
name: troubleshooting-liferay
description: 'Use when the local Liferay runtime is failing, unhealthy or behaving incorrectly and the cause is not yet clear.'
---

# Troubleshooting Liferay

Use this skill for diagnosis first, not for speculative fixes.

It is also the reusable home for local reproduction workflows when the issue
depends on production-like data or isolated worktree state.

## Before exploring

Read `../liferay-expert/references/domain-awareness.md` and apply the project
glossary in `docs/ai/project-context.md` to hypothesis names, log search terms,
and the diagnostic notes you produce. Surface conflicts before deeper analysis.

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

`ldev status --json` returns Docker/container state. `ldev context --json`
returns offline repo/config/auth facts. They are not interchangeable — use
`ldev status` only to confirm the env is running, not for routing decisions.

When `doctor.checks[]` contains failures, add the matching scope flag for
deeper checks:

```bash
ldev doctor --runtime --json   # container and service health
ldev doctor --portal --json    # portal API reachability and auth
ldev doctor --osgi --json      # bundle state and missing requirements
```

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

For non-trivial or recurring failures, apply the disciplined loop in
`references/diagnose-discipline.md` (build feedback loop → reproduce →
ranked hypotheses → instrument with tagged logs → fix + regression test →
cleanup). Use the Liferay-specific commands below as the building blocks of
that loop.

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

If a page, site, structure or template is involved, resolve it from the portal
immediately. When the report mentions one or more URLs, inspect every mentioned
URL with `ldev portal inventory page --url` before code search, browser
reproduction, or speculative diagnosis:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory structures --site /<site> --with-templates --json
ldev portal inventory templates --site /<site> --json
```

For structure/template incidents, treat `--with-templates` as the default
discovery path to avoid separate lookup rounds.

Do not assume two reported URLs point to the same page state, site, or owning
resource until both have been inspected.

When the default output is not enough (e.g. you need content fields, all template
candidates, or the raw page definition), add `--full`:

```bash
ldev portal inventory page --url <fullUrl> --json --full
```

`--full` adds for display pages: `full.articleDetails.contentFields`, all template
candidates, all `renderedContents`. For regular pages: `full.configurationRaw` and
`full.components.fragments` with `editableFields`.

### Production reproduction

When a clean local environment is not enough, import production-like state
before guessing:

```bash
# Sync database from Liferay Cloud
ldev db sync --environment <env> --project <lcp-project> --force
# OR import a local backup
ldev db import --file /path/to/backup.sql.gz --force

# If the issue depends on Document Library files, download them first
ldev db files-download --environment <env> --project <lcp-project> --doclib-dest docker/doclib/<env>
ldev db files-mount --path docker/doclib/<env>
# OR mount a local path directly
ldev db files-mount --path /path/to/doclib

# Restart and verify
ldev start
ldev doctor --json
ldev logs diagnose --since 15m --json
```

After import, check content volume before reindexing:

```bash
ldev portal inventory sites --with-content --sort-by content
```

For database restore options, file-download flows, content pruning, and
post-import tuning, see `references/production-reproduction.md`.

### Specialized diagnosis paths

Use `references/specialized-diagnosis.md` for isolated worktree incidents,
reindex incidents, search widget failures, and content-version cleanup cases.

## Recovery actions

Use these only when diagnosis points to broken local runtime state:

Reference:

- `references/ddm-migration.md`
- `references/production-reproduction.md`
- `references/specialized-diagnosis.md`

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
- If isolation matters, prefer `ldev worktree setup --name <name> --with-env --stop-main-for-clone --restart-main-after-clone` over ad hoc branch switching.
- If a worktree needs read-only discovery against the main runtime, use `ldev --repo-root <main-root> ...` instead of changing directories.
- After finding the root cause, switch to `developing-liferay` or `deploying-liferay` for the actual fix path.
