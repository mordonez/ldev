import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatAgentCapabilities, runAgentCapabilities} from '../../features/agent/agent-capabilities.js';

export function createCapabilitiesCommand(): Command {
  return addOutputFormatOption(
    new Command('capabilities')
      .description('Show which command areas are actually usable in the current project context')
      .addHelpText('after', `
Use this command when you need to know:
  which ldev areas are supported right now
  which prerequisites are still missing
  whether Docker, worktree or Liferay operations are ready

Preferred format for automation:
  capabilities --json
`),
  ).action(createFormattedAction(
    async (context) => runAgentCapabilities(context.cwd, {config: context.config, env: process.env}),
    {text: formatAgentCapabilities},
  ));
}
