import {Command} from 'commander';

import {registerDbDatabaseCommands} from './db-commands-database.js';
import {registerDbFilesCommands} from './db-commands-files.js';

export function createDbCommand(): Command {
  const command = new Command('db');

  command.description('Database backups, local import and Document Library tooling').addHelpText(
    'after',
    `
Use this namespace for state transfer between LCP and the local runtime.
It is intended for data migration, recovery and larger environment-management workflows.

Command groups:
  download / import / sync   PostgreSQL backup workflows
  files-*                    Document Library download, detection and mount workflows

Destructive behavior:
  import --force / sync --force   Replace the current local postgres-data before importing
`,
  );

  registerDbDatabaseCommands(command);
  registerDbFilesCommands(command);

  return command;
}
