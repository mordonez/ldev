import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatProjectResult, runProjectInit} from '../../features/project/project-init.js';
import type {DockerService} from '../../features/project/project-scaffold.js';

export function createProjectCommand(): Command {
  const command = new Command('project');
  const initCommand = addOutputFormatOption(
    command
      .command('init')
      .helpGroup('Recommended commands:')
      .description('Create a new project scaffold linked to local tooling')
      .requiredOption('--name <name>', 'Project name')
      .requiredOption('--dir <dir>', 'Target directory')
      .option('--services <services>', 'Comma-separated extra services to enable: postgres, elasticsearch')
      .option('--commit', 'Create a git commit for the generated changes'),
  );
  initCommand.addHelpText(
    'after',
    `
Required arguments:
  --name  Project name used for the initial scaffold
  --dir   Destination directory to create or initialize

Optional arguments:
  --services  Comma-separated list of extra Docker services to include.
              Supported values: postgres, elasticsearch
              Example: --services postgres,elasticsearch

Examples:
  ldev project init --name my-project --dir ~/projects/my-project
  ldev project init --name my-project --dir . --services postgres
  ldev project init --name my-project --dir . --services postgres,elasticsearch
`,
  );

  command.description('Project scaffold and tooling integration').addHelpText(
    'after',
    `
Use this namespace when bootstrapping a repo, not during normal daily development.

Preferred commands:
  init  Create a new project scaffold ready to run with ldev

By default this command never creates a git commit.
Use --commit only when you explicitly want bootstrap changes committed immediately.
`,
  );

  initCommand.action(
    createFormattedAction(
      async (context, options) => {
        const services = parseServices(options.services);
        const result = await runProjectInit({
          name: options.name,
          targetDir: options.dir,
          printer: context.printer,
          commit: Boolean(options.commit),
          services,
        });
        return result;
      },
      {text: formatProjectResult},
    ),
  );

  return command;
}

function parseServices(raw: string | undefined): DockerService[] {
  if (!raw) return [];
  const valid: DockerService[] = ['postgres', 'elasticsearch'];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DockerService => valid.includes(s as DockerService));
}
