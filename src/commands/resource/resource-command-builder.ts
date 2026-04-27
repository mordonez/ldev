import {Command} from 'commander';

import {createCommandContext} from '../../cli/command-context.js';
import {runLiferayPreflight} from '../../features/liferay/liferay-preflight.js';
import {registerResourceExportCommands} from './resource-export-commands.js';
import {registerResourceImportCommands} from './resource-import-commands.js';
import {registerResourceMigrationCommand} from './resource-migration-command.js';
import {registerResourceReadCommands} from './resource-read-commands.js';

export type ResourceCommandOptions = {
  description: string;
  helpText: string;
  helpGroup?: string;
};

export function buildResourceCommand(options: ResourceCommandOptions): Command {
  const resource = new Command('resource')
    .description(options.description)
    .option('--liferay-url <url>', 'Override Liferay base URL for this command')
    .option('--liferay-client-id <clientId>', 'Override Liferay OAuth2 client id for this command')
    .option(
      '--liferay-client-secret <clientSecret>',
      'Override Liferay OAuth2 client secret for this command (less secure; prefer --liferay-client-secret-env)',
    )
    .option(
      '--liferay-client-secret-env <envVar>',
      'Read Liferay OAuth2 client secret from an environment variable (recommended)',
    )
    .option('--liferay-scope-aliases <aliases>', 'Override OAuth2 scope aliases (comma-separated) for this command')
    .option('--liferay-timeout-seconds <seconds>', 'Override Liferay HTTP timeout in seconds for this command')
    .option('--preflight', 'Run API surface preflight before executing resource subcommands')
    .addHelpText(
      'after',
      'Override precedence: --liferay-client-secret has priority over --liferay-client-secret-env.\n' +
        'Security tip: prefer --liferay-client-secret-env in local shells and CI to avoid exposing secrets in process args/history.\n\n' +
        options.helpText,
    );

  if (options.helpGroup) {
    resource.helpGroup(options.helpGroup);
  }

  resource.hook('preAction', async (_thisCommand, actionCommand) => {
    const options = actionCommand.optsWithGlobals<{preflight?: boolean; format?: string; strict?: boolean}>();
    if (!options.preflight) {
      return;
    }

    const context = createCommandContext(options);
    await runLiferayPreflight(context.config);
  });

  registerResourceReadCommands(resource);
  registerResourceExportCommands(resource);
  registerResourceImportCommands(resource);
  registerResourceMigrationCommand(resource);

  return resource;
}
