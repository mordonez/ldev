---
name: troubleshooting-liferay
description: 'Diagnoses unhealthy or incorrect local Liferay runtimes before proposing fixes. Use when the cause is unclear, the portal is failing, logs show errors, search/content behaves incorrectly, or production-like data may be needed to reproduce.'
---

# Troubleshooting Liferay

Use this skill for diagnosis first, not speculative fixes. After the root cause
is known, switch to the workflow that owns the fix path.

## Bootstrap

```bash
ldev ai bootstrap --intent=troubleshoot --json
```

Inspect:

- `context.commands.*`
- `context.liferay.portalUrl`
- `context.liferay.auth.oauth2.*.status`
- `doctor.checks[]`
- `doctor.readiness.*`

If these fields are missing, stop and report that the installed `ldev` AI assets
are out of sync with the CLI.

## First Diagnosis Loop

```bash
ldev status --json
ldev logs diagnose --since 10m --json
ldev doctor --json
```

Use `ldev status --json` for Docker/runtime state, `ldev context --json` for
offline repo facts, and `ldev doctor --json` for active checks. They are not
interchangeable.

Add deeper doctor scopes only when the first loop points there:

```bash
ldev doctor --runtime --json
ldev doctor --portal --json
ldev doctor --osgi --json
```

If the env is down, start it before deeper analysis:

```bash
ldev start
```

## Surface-Specific Checks

- Logs/runtime health: `ldev logs diagnose --since 10m --json`
- Bundle issues: `ldev osgi status <bundle> --json` and `ldev osgi diag <bundle> --json`
- Hanging portal: `ldev osgi thread-dump`
- Page/site/resource issues: use the portal discovery contract in
  [../../docs/PORTAL_DISCOVERY.md](../../docs/PORTAL_DISCOVERY.md).

## Production-Like Reproduction

When clean local data is insufficient, reproduce with imported data before
guessing. Use `references/production-reproduction.md` for DB sync/import,
Document Library mounting, content volume checks, and post-import tuning.

Use `references/specialized-diagnosis.md` for isolated worktree incidents,
reindex incidents, search widget failures, and content-version cleanup.

## Recovery

Use broad recovery only when diagnosis points to broken local runtime state:

```bash
ldev stop
ldev env restore
ldev start
```

## Done When

Root cause is identified and documented. Route to the fix skill (`developing-liferay`,
`portal-resource-workflow`, etc.). Do not claim done from an untested hypothesis.

## Guardrails

- Do not jump straight to rebuild, clean, or restore.
- Prefer `ldev logs diagnose --json` before raw logs.
- Use MCP only as an optional read-only diagnosis layer.
- Do not parse human text when JSON exists.
- If the issue depends on production data, reproduce that state locally before
  proposing fixes.
- If isolation matters, use `isolating-worktrees` instead of ad hoc branch switching.
