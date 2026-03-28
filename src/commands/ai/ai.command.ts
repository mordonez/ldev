import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatAiResult, runAiInstall} from '../../features/ai/ai-install.js';
import {runAiUpdate} from '../../features/ai/ai-update.js';

export function createAiCommand(): Command {
  const command = new Command('ai');
  const installCommand = addOutputFormatOption(
    command
      .command('install')
      .description('Install the standard reusable AI assets into a project')
      .requiredOption('--target <target>', 'Project root')
      .option('--force', 'Overwrite AGENTS.md if it already exists')
      .option('--skills-only', 'Only update vendor skills from the manifest'),
  );
  const updateCommand = addOutputFormatOption(
    command
      .command('update')
      .description('Safely update vendor skills listed in the manifest')
      .requiredOption('--target <target>', 'Project root'),
  );

  command.description('Standard reusable AI assets and skills for ldev projects').addHelpText(
    'after',
    `
This namespace bootstraps only the reusable vendor-managed AI surface.
Project-specific context, prompts and workflows should stay in the project repo.

Safe defaults:
  update         Refresh vendor-managed skills listed in the manifest

Potentially mutating:
  install --force   Overwrite AGENTS.md when bootstrapping a project
`,
  );

  installCommand.action(
    createFormattedAction(
      async (context, options) => {
        const result = await runAiInstall({
          targetDir: options.target,
          force: Boolean(options.force),
          skillsOnly: Boolean(options.skillsOnly),
          printer: context.printer,
        });
        return result;
      },
      {text: formatAiResult},
    ),
  );

  updateCommand.action(
    createFormattedAction(
      async (context, options) => {
        const result = await runAiUpdate({
          targetDir: options.target,
          printer: context.printer,
        });
        return result;
      },
      {text: formatAiResult},
    ),
  );

  return command;
}
