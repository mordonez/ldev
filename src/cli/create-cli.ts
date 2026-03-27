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
  Drop into namespaces only when you need explicit workspace, runtime or Liferay operations.

For scripting and automation:
  ${ROOT_HELP_SECTIONS.automationContract.join('\n  ')}

Examples:
  ${ROOT_HELP_SECTIONS.examples.join('\n  ')}
`);

  for (const entry of ROOT_COMMANDS) {
    const command = entry.factory().helpGroup(entry.group);
    program.addCommand(command, entry.hidden ? {hidden: true} : undefined);
  }

  return program;
}
