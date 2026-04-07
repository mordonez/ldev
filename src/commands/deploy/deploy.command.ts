import {Command} from 'commander';

import {registerDeployBuildCommands} from './deploy-commands-build.js';
import {registerDeployRuntimeCommands} from './deploy-commands-runtime.js';

export function createDeployCommand(): Command {
  const command = new Command('deploy');

  command.description('Build and deploy modules, themes and services').addHelpText(
    'after',
    `
Use this namespace when you want explicit control over build outputs.
If your goal is just "make local changes available in the running env",
prefer the simplest command that matches the scope:
  deploy prepare       Build artifacts without touching runtime state
  deploy module <x>    Rebuild one deployable unit
  deploy all           Rebuild everything for the current repo

Recommended starting points:
  deploy module / deploy theme  Focused rebuild flows for day-to-day local work
  the rest of this namespace is better suited to advanced build and maintenance workflows

Safe defaults:
  prepare       Build local deploy artifacts without touching Docker runtime
  cache-update  Refresh ENV_DATA_ROOT/liferay-deploy-cache from current artifacts

Mutating commands:
  all, module, theme, service   Run Gradle tasks and update local build outputs
`,
  );

  registerDeployBuildCommands(command);
  registerDeployRuntimeCommands(command);

  return command;
}
