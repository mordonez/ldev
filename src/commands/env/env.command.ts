import {Command} from 'commander';

import {registerEnvDiagnosticsCommands} from './env-commands-diagnostics.js';
import {registerEnvOperationsCommands} from './env-commands-operations.js';

export function createEnvCommand(): Command {
  const command = new Command('env').enablePositionalOptions();

  command.description('Advanced Docker environment operations').addHelpText(
    'after',
    `
Advanced Docker lifecycle operations for recovery, diagnostics and scripting.
For the daily flow, use the top-level commands: setup, status, logs, shell.

Operations in this namespace:
  init       Create or normalize docker/.env
  restart    Restart the liferay service
  recreate   Recreate the liferay service containers
  restore    Replace runtime data from main or BTRFS_BASE
  clean      Destructive: remove Docker resources and bind-mounted data
  wait       Wait until Liferay is healthy (for scripting)
  diff       Compare current environment against a saved baseline
  is-healthy Scriptable health exit code
`,
  );

  registerEnvOperationsCommands(command);
  registerEnvDiagnosticsCommands(command);

  return command;
}
