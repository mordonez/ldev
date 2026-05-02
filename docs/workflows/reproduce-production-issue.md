---
title: Reproduce a Production Issue Locally
description: Bring production state into a local Liferay environment so you can debug and verify changes safely. LCP-aware.
---

# Reproduce a Production Issue Locally

Use this workflow when the bug only appears against production-like data.

`ldev` makes the data-transfer + local-debug loop concrete. It does **not**
guess production for you — you need either a Liferay Cloud (LCP) project to
pull from, or an existing backup file.

## Where the data comes from

- **Liferay Cloud (LCP)** — `ldev db sync` and `ldev db files-download` pull
  from your LCP project directly. They use the `lcp` CLI under the hood, so
  you need it installed and authenticated.
- **Self-hosted** — `ldev db sync` does not apply. You need a backup you
  already have, and you import it with `ldev db import --file <backup>`.

## 1. Pull (or import) the database

If your portal lives in LCP:

```bash
ldev db sync --environment production --project my-lcp-project --force
```

`--force` replaces the current local PostgreSQL data so the environment
matches the selected backup.

If you have a local `.sql`, `.gz`, or `.dump` file (LCP or self-hosted):

```bash
ldev db import --file /path/to/backup.sql.gz --force
```

## 2. Pull the Document Library (if needed)

If the issue depends on documents, images or file-backed content, and your
files are in LCP:

```bash
ldev db files-download \
  --environment production \
  --project my-lcp-project \
  --doclib-dest docker/doclib/production

ldev db files-mount --path docker/doclib/production
```

If the file store is outside LCP, move the files manually and mount them:

```bash
ldev db files-mount --path /path/to/manual/doclib
```

## 3. Start the local environment

```bash
ldev start
ldev doctor
```

You now have a local environment close enough to production state to debug
without touching production users.

## 4. Discover the affected portal area

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /global --json
ldev portal inventory page --url /home --json
```

This is one structured response per call — usually faster than clicking
through the UI, especially when the UI is itself failing.

## 5. Triage the issue

```bash
ldev logs diagnose --since 15m --json
ldev osgi diag com.acme.foo.web
```

Use whichever command matches the failure signal you found. Be honest about
what these do — see [Diagnose an Issue](/workflows/diagnose-issue) for the
limits.

## 6. Apply the fix locally

```bash
ldev deploy module foo-web
```

Or update portal/resource/config state in the repo, then restart:

```bash
ldev env restart
```

## 7. Verify locally before any production action

```bash
ldev portal check
ldev portal inventory page --url /home --json
ldev logs diagnose --since 5m --json
```

This is the safety loop:

1. reproduce production state locally
2. triage with local access
3. apply the fix safely
4. verify with the same commands

## When to use a worktree

If you want to keep your main checkout untouched and reproduce the incident
on a parallel runtime, see [Worktrees](/advanced/worktrees) — `ldev worktree
setup --with-env` gives you isolated Postgres/Liferay/OSGi state per branch.
