import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatLiferayAuthToken, runLiferayAuthToken} from '../../features/liferay/liferay-auth.js';
import {formatLiferayHealth, runLiferayHealth} from '../../features/liferay/liferay-health.js';

type LiferayAuthTokenCommandOptions = {
  raw?: boolean;
  resource?: string;
  mcp?: boolean;
};

export function createAuthCommands(parent: Command): void {
  const auth = new Command('auth').description('OAuth2 token retrieval for scripting');
  auth.helpGroup('Connectivity and auth:');

  addOutputFormatOption(
    auth
      .command('token')
      .description('Fetch an OAuth2 access token for scripting')
      .option('--raw', 'Print only the access token in text format')
      .option('--resource <url>', 'RFC 8707 resource indicator to bind the token audience to (e.g. an MCP server URL)')
      .option('--mcp', "Shorthand for --resource <portalUrl>/o/mcp, for Liferay's native MCP server")
      .addHelpText(
        'after',
        `
By default the token works for Headless REST but Liferay's native MCP server
(/o/mcp, DXP 2026.Q3+) rejects it: it requires the token's audience to
include the MCP resource URI. Use the same 'ldev'-managed OAuth2 app for
both by requesting an MCP-bound token instead:

  ldev portal auth token --mcp --raw

Paste that into an MCP client config (Claude Desktop, Cursor, ...) as the
Bearer token. It expires with the token lifetime like any other access
token -- re-run this command to get a fresh one.
`,
      ),
  ).action(
    createFormattedAction(
      async (context, options: LiferayAuthTokenCommandOptions) =>
        runLiferayAuthToken(context.config, {
          resource: options.mcp ? `${context.config.liferay.url}/o/mcp` : options.resource,
        }),
      (options: LiferayAuthTokenCommandOptions) => ({
        text: (result: Awaited<ReturnType<typeof runLiferayAuthToken>>) =>
          formatLiferayAuthToken(result, {raw: Boolean(options.raw)}),
        json: (result: Awaited<ReturnType<typeof runLiferayAuthToken>>) => ({
          ...result,
          ...(options.raw ? {} : {accessToken: undefined}),
        }),
      }),
    ),
  );

  parent.addCommand(auth);

  addOutputFormatOption(
    parent
      .command('check')
      .helpGroup('Connectivity and auth:')
      .description('Check OAuth2 auth and basic Liferay API reachability'),
  ).action(createFormattedAction(async (context) => runLiferayHealth(context.config), {text: formatLiferayHealth}));
}
