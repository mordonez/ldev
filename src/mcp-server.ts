#!/usr/bin/env node
import {readMcpPackageVersion, startMcpServer} from './features/mcp-server/mcp-server.js';

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  process.stdout.write(`${readMcpPackageVersion()}\n`);
  process.exit(0);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(
    [
      'Usage: ldev-mcp-server [options]',
      '',
      'Start the ldev MCP server on stdio.',
      '',
      'Options:',
      '  -v, --version  Print version',
      '  -h, --help     Print help',
    ].join('\n') + '\n',
  );
  process.exit(0);
}

startMcpServer().catch((err: unknown) => {
  process.stderr.write(`ldev-mcp-server: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
