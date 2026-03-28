---
layout: default
title: Automation Contract
---

# Automation Contract v1

`ldev` exposes a stable machine-readable contract for CI pipelines, scripts, and tooling integrations.

## Supported Surface

| Command | `--json` | `--ndjson` | Notes |
|---|---|---|---|
| `ldev doctor` | yes | yes | Host prerequisite checks |
| `ldev context` | yes | yes | Repo, paths, resolved config |
| `ldev status` | yes | yes | Container and service state |
| `ldev setup` | — | — | Pull images, seed configs |
| `ldev start` | — | — | Start containers |
| `ldev stop` | — | — | Stop containers |
| `ldev logs --no-follow` | — | — | Dump container logs |
| `ldev shell` | — | — | Interactive Liferay shell |
| `ldev liferay inventory *` | yes | yes | Sites, pages, structures, templates |
| `ldev liferay resource *` | yes | yes | Export, import, sync, migration |
| `ldev liferay auth check` | yes | yes | OAuth2 connectivity check |

## Output Formats

```bash
ldev doctor --format json     # explicit
ldev doctor --json            # shorthand alias
ldev doctor --ndjson          # newline-delimited JSON
```

| Format | Stdout | Stderr | Use case |
|---|---|---|---|
| `text` (default) | Human-readable, colored | Colored messages | Interactive terminal |
| `json` | Pretty-printed (2-space) | Pretty-printed JSON | Scripts, jq piping |
| `ndjson` | Compact single-line per record | Compact JSON | Streaming, log aggregation |

## Success Response

Commands write their result object directly to stdout. The `ok` field is always present in v1:

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

| Field | Type | Required | Description |
|---|---|---|---|
| `ok` | `false` | yes | Always `false` for errors |
| `error.code` | `string` | yes | Machine-readable error code |
| `error.message` | `string` | yes | Human-readable description |
| `error.details` | `unknown` | no | Additional context |

In `text` mode, errors are written to stderr as `CODE: message`.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments or usage |

## Compatibility Rules

1. **Additive-only** — new keys may be added, existing keys will not be removed or renamed in v1
2. **`ok` is always present** — every JSON response includes `ok: true` or `ok: false`
3. **Error shape is fixed** — `{ code, message, details? }` will not change in v1
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
ldev liferay resource export-structures --format ndjson | while read -r line; do
  name=$(echo "$line" | jq -r '.name')
  echo "Exported: $name"
done
```

### Pipeline: check connectivity

```bash
if ldev liferay auth check --json | jq -e '.ok' > /dev/null 2>&1; then
  echo "Liferay API is reachable"
else
  echo "Connection failed"
  exit 1
fi
```

[Back to Home](./)
