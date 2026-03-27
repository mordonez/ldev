import {Command} from 'commander';

import {ROOT_COMMANDS, ROOT_HELP_SECTIONS} from './root-command-manifest.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('ldev')
    .description('Official Liferay local development CLI')
    .showHelpAfterError()
    .addHelpText('after', `
Quick start:
  ${ROOT_HELP_SECTIONS.quickStart.join('\n  ')}

Happy path:
  Use the top-level commands for daily local development.
  Drop into namespaces only when you need project bootstrap, Liferay inspection or advanced runtime work.

Top-level aliases:
  ${ROOT_HELP_SECTIONS.aliases.join('\n  ')}

Command model:
  Core commands      Daily lifecycle for one local Liferay environment
  Project commands   Bootstrap, sync and build tasks tied to the current repo
  Advanced runtime   Diagnostics, worktrees and explicit Liferay API operations
  Internal commands  Vendor-maintained tooling not needed in the normal flow

Agent contract v1:
  ${ROOT_HELP_SECTIONS.agentContract.join('\n  ')}

Examples:
  ${ROOT_HELP_SECTIONS.examples.join('\n  ')}
`);

  for (const entry of ROOT_COMMANDS) {
    program.addCommand(entry.factory().helpGroup(entry.group));
  }

  return program;
}
