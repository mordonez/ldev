#!/usr/bin/env node
import {startMcpServer} from './features/mcp-server/mcp-server.js';

startMcpServer().catch((err: unknown) => {
  process.stderr.write(`ldev-mcp-server: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
