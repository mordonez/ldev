---
title: Automation Contract
description: Stable JSON/NDJSON output contract for ldev commands. Reliable integration for CI/CD pipelines and coding agents.
---

`ldev` exposes a stable machine-readable contract for CI pipelines, scripts, and tooling integrations.

This page is secondary to the core onboarding flow. Start with `doctor`, `setup`, `start`, `project`, and basic portal connectivity before treating automation-oriented surfaces as your primary entrypoint.

## Supported Surface

The list below is an automation contract inventory, not a claim that every advanced namespace is equally central to the product story.

- `ldev doctor`: `--json` yes, `--ndjson` yes. Host prerequisite checks.
- `ldev context`: `--json` yes, `--ndjson` yes. Repo, paths, resolved config.
- `ldev status`: `--json` yes, `--ndjson` yes. Container and service state.
- `ldev setup`: `--json` no, `--ndjson` no. Pull images and seed configs.
- `ldev start`: `--json` no, `--ndjson` no. Start containers.
- `ldev stop`: `--json` no, `--ndjson` no. Stop containers.
- `ldev logs --no-follow`: `--json` no, `--ndjson` no. Dump container logs.
- `ldev shell`: `--json` no, `--ndjson` no. Interactive Liferay shell.
- `ldev portal inventory *`: `--json` yes, `--ndjson` yes. Sites, pages, structures, templates.
- `ldev resource *`: `--json` yes, `--ndjson` yes. Export, import, sync, migration.
- `ldev portal check`: `--json` yes, `--ndjson` yes. OAuth2 connectivity check.

## Output Formats

```bash
ldev doctor --format json     # explicit
ldev doctor --json            # shorthand alias
ldev doctor --ndjson          # newline-delimited JSON
```

| Format           | Stdout                         | Stderr              | Use case                   |
| ---------------- | ------------------------------ | ------------------- | -------------------------- |
| `text` (default) | Human-readable, colored        | Colored messages    | Interactive terminal       |
| `json`           | Pretty-printed (2-space)       | Pretty-printed JSON | Scripts, jq piping         |
| `ndjson`         | Compact single-line per record | Compact JSON        | Streaming, log aggregation |

## Success Response

Commands write their result object directly to stdout. The `ok` field is always present in the current contract:

```json
{
  "ok": true,
  "baseUrl": "http://localhost:9000",
  "clientId": "liferay-cli",
  "accessToken": "eyJ..."
}
```

## Error Response

Errors in JSON/NDJSON mode are written to **stderr**:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "OAuth2 token request failed: 401 Unauthorized",
    "details": {}
  }
}
```

| Field           | Type      | Required | Description                 |
| --------------- | --------- | -------- | --------------------------- |
| `ok`            | `false`   | yes      | Always `false` for errors   |
| `error.code`    | `string`  | yes      | Machine-readable error code |
| `error.message` | `string`  | yes      | Human-readable description  |
| `error.details` | `unknown` | no       | Additional context          |

In `text` mode, errors are written to stderr as `CODE: message`.

## Exit Codes

| Code | Meaning                    |
| ---- | -------------------------- |
| `0`  | Success                    |
| `1`  | General error              |
| `2`  | Invalid arguments or usage |

## Compatibility Rules

1. **Additive-only** — new keys may be added, existing keys will not be removed or renamed within the current contract
2. **`ok` is always present** — every JSON response includes `ok: true` or `ok: false`
3. **Error shape is fixed** — `{ code, message, details? }` will not change within the current contract
4. **Stderr is for errors and info** — stdout contains only the primary result
5. **`context` is canonical** — use `ldev context --json` to discover repo paths, URLs, and resolved config

## Examples

### CI: wait for Liferay to be ready

```bash
ldev start
ldev env wait --timeout 180
ldev doctor --json | jq '.checks[] | select(.ok == false)'
```

### Script: export all structures

```bash
ldev resource export-structures --format ndjson | while read -r line; do
  name=$(echo "$line" | jq -r '.name')
  echo "Exported: $name"
done
```

### Pipeline: check connectivity

```bash
if ldev portal check --json | jq -e '.ok' > /dev/null 2>&1; then
  echo "Liferay API is reachable"
else
  echo "Connection failed"
  exit 1
fi
```

[Back to Home](/)
