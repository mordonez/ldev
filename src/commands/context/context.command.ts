import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatAgentContext, runAgentContext} from '../../features/agent/agent-context.js';

export function createContextCommand(): Command {
  return addOutputFormatOption(
    new Command('context')
      .description('Resolve the current repo, runtime and Liferay context as a single stable snapshot')
      .option('--describe', 'Print the context JSON contract schema summary instead of project data')
      .addHelpText(
        'after',
        `
Use this command first when you need to discover:
  repo root, worktree and key paths
  local portal URL and compose project name
  resolved Liferay auth and resource paths
  which command areas are ready right now

Offline and fast; this command does not contact Docker or the portal.
It may include lightweight local runtime diagnostics in the JSON payload.
Use doctor when you need the full readiness contract.

Preferred format for automation:
  context --json
  context --describe --json
`,
      ),
  ).action(
    createFormattedAction(
      async (context, options: {describe?: boolean}) => {
        if (options.describe) {
          return {
            ok: true,
            fields: [
              'project.type',
              'project.root',
              'project.branch',
              'liferay.version',
              'liferay.edition',
              'liferay.portalUrl',
              'liferay.auth.oauth2.clientId.status',
              'paths.resources.*',
              'inventory.modules.count',
              'inventory.modules.sample',
              'platform.tools.*',
              'commands.*.supported',
              'issues[].code',
              'issues[].severity',
            ],
          };
        }

        return runAgentContext(context.cwd, {config: context.config});
      },
      {
        text: (result) => ('project' in result ? formatAgentContext(result) : JSON.stringify(result, null, 2)),
      },
    ),
  );
}
