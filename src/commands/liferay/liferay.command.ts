import {Command} from 'commander';

import {createReindexCommand} from '../reindex/reindex.command.js';
import {createAuthCommands} from './auth.command.js';
import {createContentCommand} from './content.command.js';
import {createLiferayConfigCommand} from './config.command.js';
import {createInventoryCommands} from './inventory.command.js';
import {createLiferayAuditCommands} from './liferay-audit.command.js';
import {createPageLayoutCommands} from './page-layout.command.js';
import {createLiferaySearchCommand} from './search.command.js';
import {createLiferayThemeCheckCommand} from './liferay-theme-check.command.js';

export function createPortalCommand(): Command {
  const command = new Command('portal').alias('liferay');

  command
    .description('Portal inspection, config, inventory and API')
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
    .addHelpText(
      'after',
      `
Use this namespace for portal inspection and API operations against a running Liferay instance.
For resource export, import and migration workflows, use the top-level 'resource' namespace.

Recommended starting points:
  check, auth   Connectivity and API access checks
  inventory     Main discovery workflow for agents and humans

Discovery examples:
  ldev portal inventory sites --json
  ldev portal inventory page --url /web/guest/home --json

Main groups:
  check        OAuth2 verification and basic API reachability
  auth         OAuth2 token retrieval for scripting
  config       Effective local portal-ext and OSGi config inspection
  inventory    Sites, pages, structures and templates
  audit        Minimal runtime audit of a site and API reachability
  page-layout  Export and diff of content pages
  search       Elasticsearch inspection and test queries
  theme-check  Validate Clay icon coverage in a deployed theme
  reindex      Reindex observation and temporary tuning
  content      Journal/web content management (prune for local environments)
`,
    );

  createAuthCommands(command);
  command.addCommand(createLiferayConfigCommand().helpGroup('Portal diagnostics:'));
  createInventoryCommands(command);
  command.addCommand(createContentCommand().helpGroup('Content management:'));
  createLiferayAuditCommands(command);
  createPageLayoutCommands(command);
  command.addCommand(createLiferaySearchCommand().helpGroup('Portal diagnostics:'));
  command.addCommand(createLiferayThemeCheckCommand().helpGroup('Portal diagnostics:'));
  command.addCommand(createReindexCommand().helpGroup('Portal diagnostics:'));

  return command;
}
