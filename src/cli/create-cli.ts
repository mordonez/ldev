import {Command} from 'commander';

import type {LdevPlugin} from './plugin.js';
import {BUILTIN_PLUGINS} from './builtin-plugins.js';
import {ROOT_HELP_SECTIONS} from './command-registry.js';

export function createCli(plugins: LdevPlugin[] = BUILTIN_PLUGINS): Command {
  const program = new Command();

  program
    .name('ldev')
    .description('Official Liferay local development CLI')
    .showHelpAfterError()
    .addHelpText(
      'after',
      `
Quick start:
  ${ROOT_HELP_SECTIONS.quickStart.join('\n  ')}

Happy path:
  Use the top-level commands for daily local development.
  Drop into namespaces only when you need explicit workspace, runtime or Liferay operations.

For scripting and automation:
  ${ROOT_HELP_SECTIONS.automationContract.join('\n  ')}

Examples:
  ${ROOT_HELP_SECTIONS.examples.join('\n  ')}
`,
    );

  for (const plugin of plugins) {
    plugin.register(program);
  }

  return program;
}
