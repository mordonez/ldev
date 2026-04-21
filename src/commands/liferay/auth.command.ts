import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatLiferayAuthToken, runLiferayAuthToken} from '../../features/liferay/liferay-auth.js';
import {formatLiferayHealth, runLiferayHealth} from '../../features/liferay/liferay-health.js';

type LiferayAuthTokenCommandOptions = {
  raw?: boolean;
};

export function createAuthCommands(parent: Command): void {
  const auth = new Command('auth').description('OAuth2 token retrieval for scripting');
  auth.helpGroup('Connectivity and auth:');

  addOutputFormatOption(
    auth
      .command('token')
      .description('Fetch an OAuth2 access token for scripting')
      .option('--raw', 'Print only the access token in text format'),
  ).action(
    createFormattedAction(
      async (context) => runLiferayAuthToken(context.config),
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
