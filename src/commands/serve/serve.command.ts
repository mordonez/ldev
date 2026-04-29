import {Command} from 'commander';
import {startMcpServer} from '../../features/mcp-server/mcp-server.js';

export function createServeCommand(): Command {
  return new Command('serve')
    .description('Start the ldev MCP server on stdio (for Claude Code, Cursor, Claude Desktop)')
    .addHelpText(
      'after',
      `
Config examples:

  Claude Code (.claude/mcp.json):
    {"mcpServers":{"ldev":{"command":"ldev-mcp-server"}}}

  Cursor (.cursor/mcp.json):
    {"mcpServers":{"ldev":{"command":"ldev-mcp-server"}}}

  npx (no global install):
    {"mcpServers":{"ldev":{"command":"npx","args":["--package","@mordonezdev/ldev","-y","ldev-mcp-server"]}}}
`,
    )
    .action(async () => {
      await startMcpServer();
    });
}
