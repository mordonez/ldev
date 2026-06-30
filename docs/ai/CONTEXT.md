# Context Efficiency Rules for ldev Agents

This document defines operational rules that reduce unnecessary token consumption,
prevent context saturation, and avoid trial-and-error API cycles when using `ldev`
in agent workflows.

Read this alongside `AGENTS.md`. `AGENTS.md` defines the workflow contract;
this document defines efficiency constraints within that contract.

---

## Rule 1: Read bootstrap context before calling any portal command

```bash
ldev ai bootstrap --intent=discover --cache=60 --json
```

Extract what you need before issuing portal commands:

| What you need | Where to read it |
|---|---|
| Portal URL | `context.liferay.portalUrl` |
| Auth status | `context.liferay.auth.oauth2.clientId.status` |
| Active site | `context.liferay.auth.oauth2.clientId.status` + inventory |
| Resource paths | `context.paths.resources.*` |

Do not issue a portal command if `context.liferay.portalUrl` is absent or if auth status is not `"present"`.

---

## Rule 2: Resolve IDs and keys via inventory, never by assumption

Liferay IDs (group IDs, structure IDs, template IDs) change between portal restores and between environments. Friendly URL paths (`/estudis`) are stable but must still be verified against the live portal.

**Before using any ID or key:**

```bash
ldev portal inventory sites --json          # → siteFriendlyUrl
ldev portal inventory structures --site /<site> --json   # → key
ldev portal inventory templates --site /<site> --json    # → key
ldev resource fragments --site /<site> --json            # → fragmentKey
```

Never hardcode numeric IDs like `20121` in a plan or command sequence.

---

## Rule 3: Minimum fields for common operations

Liferay API responses return 20-80 fields per object. For most agent tasks, only a few are needed.

| Operation | Fields you actually need |
|---|---|
| Identify a site | `siteFriendlyUrl`, `siteName` |
| Identify a structure | `key`, `name` |
| Verify an import | `key`, `id`, `name` |
| Check article status | `id`, `title`, `friendlyUrlPath`, `workflowStatusInfo` |
| Check page fragments | `fragmentKey`, `name`, `collectionName` |

When `ldev portal inventory ...` returns more data than you need, extract these fields with `jq` or `ConvertFrom-Json` before processing. Do not forward a full 80-field response into your reasoning context.

---

## Rule 4: Commands that saturate context — handle with care

These commands can return large responses. Apply the listed mitigation before using their output:

| Command | Risk | Mitigation |
|---|---|---|
| `ldev portal inventory page --full` | 50+ KB per page | Filter to the fields needed for the task |
| `ldev portal inventory where-used` | Minutes + N×M results | Confirm with user before running; scope to `--site` |
| `ldev portal inventory pages` | Deep recursive tree | Use `--depth 1` or `--site` to limit scope |
| `ldev resource migration-pipeline` | Multi-phase, irreversible mutations | Never run without a prior `--check-only` phase |
| `ldev resource import-structures` (plural) | Bulk operation | Require explicit human approval; use singular per AGENTS.md |

---

## Rule 5: Use `--json` on all commands consumed by agents

Human-readable text output from `ldev` is not stable across versions. Always use `--json` when the output will be parsed or forwarded into agent reasoning:

```bash
ldev portal check --json
ldev portal inventory sites --json
ldev resource structure --site /<site> --structure <KEY> --json
ldev doctor --json
ldev logs diagnose --since 5m --json
```

---

## Rule 6: Pagination limits

Liferay returns 20 items per page by default. ldev uses `pageSize=200` for most inventory commands.

- For sites with thousands of articles or structures, inventory commands may take several seconds.
- Do not run `--all-sites` variants without confirming the number of sites first via `ldev portal inventory sites --json`.
- Do not process more than 3 pages of results without asking the user if they want to continue.

---

## Rule 7: Diagnosis before retry

If a command fails, do not retry with guessed parameters. Diagnose first:

```bash
ldev logs diagnose --since 5m --json     # runtime/deploy errors
ldev doctor --json                        # tool and readiness checks
ldev portal check --json                  # auth and portal connectivity
ldev osgi diag <bundle> --json            # OSGi-specific failures
```

The failure output already tells you what to fix. Speculative retries consume API quota and may trigger rate limits.

---

## Rule 8: `--check-only` before resource mutations

All import commands that support `--check-only` must use it before the real import:

```bash
ldev resource import-structure --site /<site> --structure <KEY> --check-only
ldev resource import-template --site /<site> --template <KEY> --check-only
ldev resource import-adt --site /<site> --file <path> --widget-type <type> --check-only
ldev resource migration-pipeline --descriptor <file> --check-only
```

`import-fragment` has no `--check-only`; validate the fragment source and run a focused singular import.

---

## Rule 9: Write context to `docs/ai/project-learnings.md`, not to agent memory

When you discover a project-specific invariant (a site key, a structure key, a theme path, a workflow step), write it to `docs/ai/project-learnings.md` using `capturing-session-knowledge`. Do not rely on agent session memory across conversations.
