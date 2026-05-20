import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {
  formatProjectInitLiferayVersions,
  formatProjectResult,
  listProjectInitLiferayVersions,
  requireProjectInitOption,
  runProjectInit,
} from '../../features/project/project-init.js';
import type {DockerService} from '../../features/project/project-scaffold.js';

type ProjectInitCommandOptions = {
  name?: string;
  dir?: string;
  services?: string;
  commit?: boolean;
  liferayVersion?: string;
  listLiferayVersions?: boolean;
  allLiferayVersions?: boolean;
};

export function createProjectCommand(): Command {
  const command = new Command('project');
  const initCommand = addOutputFormatOption(
    command
      .command('init')
      .helpGroup('Recommended commands:')
      .description('Create a new project scaffold linked to local tooling')
      .option('--name <name>', 'Project name')
      .option('--dir <dir>', 'Target directory')
      .option('--services <services>', 'Comma-separated extra services to enable: postgres, elasticsearch')
      .option('--liferay-version <release-key>', 'Liferay release key to configure, for example dxp-2026.q1.7-lts')
      .option('--list-liferay-versions', 'List promoted Liferay release keys from releases-cdn.liferay.com')
      .option('--all-liferay-versions', 'Include non-promoted releases when listing versions')
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
  --liferay-version  Release key from https://releases-cdn.liferay.com/releases.json
                     Example: --liferay-version dxp-2026.q1.7-lts

Examples:
  ldev project init --list-liferay-versions
  ldev project init --name my-project --dir ~/projects/my-project
  ldev project init --name my-project --dir . --liferay-version dxp-2026.q1.7-lts
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
      async (context, options: ProjectInitCommandOptions) => {
        if (options.listLiferayVersions || options.allLiferayVersions) {
          return listProjectInitLiferayVersions({all: Boolean(options.allLiferayVersions)});
        }

        const services = parseServices(options.services);
        const result = await runProjectInit({
          name: requireProjectInitOption(options.name, '--name <name>'),
          targetDir: requireProjectInitOption(options.dir, '--dir <dir>'),
          printer: context.printer,
          commit: Boolean(options.commit),
          services,
          liferayVersion: options.liferayVersion,
        });
        return result;
      },
      {
        text: (result) =>
          Array.isArray(result) ? formatProjectInitLiferayVersions(result) : formatProjectResult(result),
      },
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
