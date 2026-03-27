import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatProjectResult, runProjectAdd} from '../../features/project/project-add.js';
import {runProjectAddCommunity} from '../../features/project/project-add-community.js';
import {runProjectInit} from '../../features/project/project-init.js';

export function createProjectCommand(): Command {
  const command = new Command('project');
  const initCommand = addOutputFormatOption(
    command
      .command('init')
      .description('Create a new project scaffold linked to local tooling')
      .requiredOption('--name <name>', 'Project name')
      .requiredOption('--dir <dir>', 'Target directory'),
  );
  const addCommand = addOutputFormatOption(
    command
      .command('add')
      .description('Link local tooling into an existing repository')
      .requiredOption('--target <target>', 'Project root'),
  );
  const addCommunityCommand = addOutputFormatOption(
    command
      .command('add-community')
      .description('Link local tooling plus Community scaffold into an existing repository')
      .requiredOption('--target <target>', 'Project root'),
  );

  command
    .description('Project scaffold and tooling integration')
    .addHelpText('after', `
Preferred commands:
  init           Create a new project scaffold ready to run with ldev
  add            Add missing ldev files into an existing repository
`);

  initCommand.action(createFormattedAction(async (context, options) => {
      const result = await runProjectInit({
        name: options.name,
        targetDir: options.dir,
        printer: context.printer,
      });
      return result;
    }, {text: formatProjectResult}));

  addCommand.action(createFormattedAction(async (context, options) => {
      const result = await runProjectAdd({
        targetDir: options.target,
        printer: context.printer,
      });
      return result;
    }, {text: formatProjectResult}));

  addCommunityCommand.action(createFormattedAction(async (context, options) => {
      const result = await runProjectAddCommunity({
        targetDir: options.target,
        printer: context.printer,
      });
      return result;
    }, {text: formatProjectResult}));

  return command;
}
