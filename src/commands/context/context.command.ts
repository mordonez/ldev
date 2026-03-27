import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatAgentContext, runAgentContext} from '../../features/agent/agent-context.js';

export function createContextCommand(): Command {
  return addOutputFormatOption(
    new Command('context')
      .description('Resolve the current repo, runtime and Liferay context as a single stable snapshot')
      .addHelpText('after', `
Use this command first when you need to discover:
  repo root, worktree and key paths
  local portal URL and compose project name
  resolved Liferay auth and resource paths

Preferred format for automation:
  context --json
`),
  ).action(createFormattedAction(
    async (context) => runAgentContext(context.cwd, {config: context.config}),
    {text: formatAgentContext},
  ));
}
