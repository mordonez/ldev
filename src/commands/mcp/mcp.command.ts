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

type McpAuthCommandOptions = {
  authorizationHeader?: string;
  username?: string;
  password?: string;
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
