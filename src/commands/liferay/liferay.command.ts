import {Command} from 'commander';

import {createReindexCommand} from '../reindex/reindex.command.js';
import {createAuthCommands} from './auth.command.js';
import {createInventoryCommands} from './inventory.command.js';
import {createPageLayoutCommands} from './page-layout.command.js';
import {createResourceCommands} from './resource.command.js';

export function createLiferayCommand(): Command {
  const command = new Command('liferay');

  command.description('Liferay API CLI for inspection, export and controlled resource imports').addHelpText(
    'after',
    `
Use this namespace for explicit portal inspection and resource operations.
If you only need local runtime control, stay on the top-level commands.

Main groups:
  check        OAuth2 verification and basic API reachability
  auth         OAuth2 token retrieval for scripting
  inventory    Sites, pages, structures and templates
  page-layout  Export and diff of content pages
  resource     Resource export, import and controlled migrations
  reindex      Reindex observation and temporary tuning
`,
  );

  createAuthCommands(command);
  createInventoryCommands(command);
  createPageLayoutCommands(command);
  createResourceCommands(command);
  command.addCommand(createReindexCommand().helpGroup('Portal diagnostics:'));

  return command;
}
