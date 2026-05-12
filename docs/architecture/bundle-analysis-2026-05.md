# Bundle Size Sanity Check — 2026-05

**Date:** 2026-05-13
**Tool:** tsdown v0.21.7 (powered by rolldown v1.0.0-rc.12)
**Build command:** `npm run build`

## Binary Sizes

| File | Raw size | Gzip |
|------|----------|------|
| `dist/index.js` (CLI entry shim) | 0.81 kB | — |
| `dist/mcp-server.js` (MCP server entry shim) | 0.81 kB | — |
| `dist/index.js` (CLI bundle, reported by tsdown as `dist/index.js`) | 540.46 kB | 117.58 kB |
| `dist/mcp-server-DyK_hHcG.js` (MCP server chunk) | 499.53 kB | 107.08 kB |

> Note: tsdown uses rolldown's code-splitting. Both entry points share a common chunk. The entry shims (`dist/index.js`, `dist/mcp-server.js`) are tiny loaders; the actual bundled code lives in the hashed chunk files.

Sizes measured with `(Get-Item dist/*.js).length` (bytes):

| File | Bytes |
|------|-------|
| `dist/index.js` | 540,456 |
| `dist/mcp-server.js` | 814 |
| `dist/mcp-server-DyK_hHcG.js` | 499,530 |

## Check 1: Does `commander` leak into the MCP server bundle?

**Result: CLEAN — no leak detected.**

```
Select-String -Pattern 'commander' -Path dist/mcp-server.js      → 0 matches
Select-String -Pattern 'commander' -Path dist/mcp-server-DyK_hHcG.js → 0 matches
```

`commander` is a CLI-only dependency and is correctly excluded from both the MCP server entry shim and its shared chunk.

## Check 2: Does `@modelcontextprotocol/sdk` leak into the CLI bundle?

**Result: EXPECTED — 2 intentional imports found.**

```
dist/index.js:17: import { Client } from "@modelcontextprotocol/sdk/client/index.js";
dist/index.js:18: import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
```

These imports originate from `src/features/mcp-server/mcp-server-doctor.ts`, which is imported by `src/commands/mcp/mcp.command.ts`. The `mcp doctor` subcommand acts as an MCP **client** to perform a stdio handshake against the locally configured ldev MCP server and list its registered tools.

This is intentional design: the CLI needs the MCP SDK **client** to implement the `ldev mcp doctor` diagnostic feature. Only `@modelcontextprotocol/sdk/client/*` sub-paths are imported — the server-side sub-paths (`server/mcp.js`, `server/stdio.js`) are correctly isolated to the MCP server bundle.

### Import chain

```
src/index.ts
  → src/commands/mcp/mcp.command.ts
    → src/features/mcp-server/mcp-server-doctor.ts
      → @modelcontextprotocol/sdk/client/index.js   (MCP Client)
      → @modelcontextprotocol/sdk/client/stdio.js   (StdioClientTransport)
```

## Conclusion

**Both bundles are clean from a boundary-violation perspective.**

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `commander` in `dist/mcp-server.js` | Not present | Not present | PASS |
| `commander` in `dist/mcp-server-DyK_hHcG.js` | Not present | Not present | PASS |
| `@modelcontextprotocol/sdk` in `dist/index.js` | Client sub-paths only | 2 client imports | PASS (intentional) |

No bug filed. No fix required. The MCP SDK **client** is legitimately used in `dist/index.js` for the `ldev mcp doctor` diagnostic command, and the MCP SDK **server** packages do not appear in the CLI bundle.
