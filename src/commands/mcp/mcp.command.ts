import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {
  formatMcpCheck,
  formatMcpOpenApis,
  formatMcpProbe,
  runMcpCheck,
  runMcpOpenApis,
  runMcpProbe,
} from '../../features/mcp/mcp.js';
import {formatMcpDoctor, runMcpDoctor} from '../../features/mcp-server/mcp-server-doctor.js';
import type {McpTool} from '../../features/mcp-server/mcp-server-setup.js';

type McpAuthCommandOptions = {
  authorizationHeader?: string;
  username?: string;
  password?: string;
};

type McpDoctorCommandOptions = {
  target: string;
  tool?: McpTool;
  skipHandshake?: boolean;
  timeout: string;
};

export function createMcpCommand(): Command {
  const command = new Command('mcp')
    .description('Inspect the official Liferay MCP server and its runtime availability')
    .addHelpText(
      'after',
      `
Recommended order:
  mcp check      Detect endpoint candidates and feature flag state
  mcp probe      Run a real MCP initialize handshake
  mcp openapis   Query the MCP get-openapis tool after initialize
  mcp doctor     Validate local ldev MCP client config and list registered tools

Auth options:
  --authorization-header 'Basic ...'
  --username <user> --password <pass>

Environment fallbacks:
  LIFERAY_MCP_AUTHORIZATION_HEADER
  LIFERAY_MCP_USERNAME
  LIFERAY_MCP_PASSWORD
`,
    );

  addMcpAuthOptions(
    addOutputFormatOption(
      command.command('check').description('Check MCP endpoint availability and feature-flag state'),
    ),
  ).action(
    createFormattedAction(
      async (context, options: McpAuthCommandOptions) => runMcpCheck(context.config, toMcpAuthOptions(options)),
      {
        text: formatMcpCheck,
      },
    ),
  );

  addMcpAuthOptions(
    addOutputFormatOption(
      command.command('probe').description('Run a real MCP initialize handshake against the portal'),
    ),
  ).action(
    createFormattedAction(
      async (context, options: McpAuthCommandOptions) => runMcpProbe(context.config, toMcpAuthOptions(options)),
      {
        text: formatMcpProbe,
      },
    ),
  );

  addMcpAuthOptions(
    addOutputFormatOption(command.command('openapis').description('Call the MCP get-openapis tool after initialize')),
  ).action(
    createFormattedAction(
      async (context, options: McpAuthCommandOptions) => runMcpOpenApis(context.config, toMcpAuthOptions(options)),
      {
        text: formatMcpOpenApis,
      },
    ),
  );

  addOutputFormatOption(
    command
      .command('doctor')
      .description('Validate local ldev MCP client config, command resolution and stdio list-tools handshake')
      .option('--target <target>', 'Project root containing MCP client config', '.')
      .option('--tool <tool>', 'Client config to check: all, claude-code, cursor, or vscode', 'all')
      .option('--skip-handshake', 'Only validate config and command resolution')
      .option('--timeout <milliseconds>', 'Timeout for command and MCP handshake checks', '10000'),
  ).action(
    createFormattedAction(
      async (_context, options: McpDoctorCommandOptions) =>
        runMcpDoctor({
          targetDir: options.target,
          tool: options.tool,
          handshake: !options.skipHandshake,
          timeoutMs: Number.parseInt(options.timeout, 10) || 10000,
        }),
      {
        text: formatMcpDoctor,
        exitCode: (result) => (result.ok ? 0 : 1),
      },
    ),
  );

  return command;
}

function addMcpAuthOptions(command: Command): Command {
  return command
    .option('--authorization-header <header>', 'Explicit Authorization header to use for MCP requests')
    .option('--username <username>', 'Basic-auth username for MCP requests')
    .option('--password <password>', 'Basic-auth password for MCP requests');
}

function toMcpAuthOptions(options: McpAuthCommandOptions) {
  return {
    authorizationHeader: options.authorizationHeader,
    username: options.username,
    password: options.password,
  };
}
