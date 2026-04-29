import {Command} from 'commander';
import {startMcpServer} from '../../features/mcp-server/mcp-server.js';

export function createServeCommand(): Command {
  return new Command('serve')
    .description('Start the ldev MCP server on stdio (for VS Code, Claude Code, Cursor, Claude Desktop)')
    .addHelpText(
      'after',
      `
Config examples:

  Claude Code (.claude/mcp.json):
    {"mcpServers":{"ldev":{"command":"ldev-mcp-server"}}}

  Cursor (.cursor/mcp.json):
    {"mcpServers":{"ldev":{"command":"ldev-mcp-server"}}}

  VS Code (.vscode/mcp.json):
    {"servers":{"ldev":{"type":"stdio","command":"ldev-mcp-server"}}}

  npx (no global install):
    {"servers":{"ldev":{"type":"stdio","command":"npx","args":["--package","@mordonezdev/ldev","-y","ldev-mcp-server"]}}}
`,
    )
    .action(async () => {
      await startMcpServer();
    });
}
