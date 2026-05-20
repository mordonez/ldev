import path from 'node:path';

import {Command} from 'commander';

import {addOutputFormatOption, createFormattedArgumentAction} from '../../cli/command-helpers.js';
import {
  formatProjectInitLiferayVersions,
  formatProjectResult,
  listProjectInitLiferayVersions,
  runProjectInit,
} from '../../features/project/project-init.js';
import type {DockerService} from '../../features/project/project-scaffold.js';
import {CliError} from '../../core/errors.js';

type ProjectInitCommandOptions = {
  name?: string;
  dir?: string;
  services?: string;
  commit?: boolean;
  liferayVersion?: string;
  listLiferayVersions?: boolean;
  allLiferayVersions?: boolean;
};

export type ResolvedProjectInitInputs = {
  name: string;
  targetDir: string;
};

export function createProjectCommand(): Command {
  const command = new Command('project');
  const initCommand = addOutputFormatOption(
    command
      .command('init')
      .argument('[dir]', 'Destination directory. Defaults to --name when omitted')
      .helpGroup('Recommended commands:')
      .description('Create a new project scaffold linked to local tooling')
      .option('--name <name>', 'Project name. Defaults to the destination directory name')
      .option('--dir <dir>', 'Target directory. Overrides the optional [dir] argument')
      .option('--services <services>', 'Comma-separated extra services to enable: postgres, elasticsearch')
      .option('--liferay-version <release-key>', 'Liferay release key to configure, for example dxp-2026.q1.7-lts')
      .option('--list-liferay-versions', 'List promoted Liferay release keys from releases-cdn.liferay.com')
      .option('--all-liferay-versions', 'Include non-promoted releases when listing versions')
      .option('--commit', 'Create a git commit for the generated changes'),
  );
  initCommand.addHelpText(
    'after',
    `
Arguments:
  [dir]   Destination directory to create or initialize. When --name is omitted,
          the project name defaults to the directory name.

Optional arguments:
  --name  Project name used for the initial scaffold
  --dir   Destination directory. Overrides the optional [dir] argument
  --services  Comma-separated list of extra Docker services to include.
              Supported values: postgres, elasticsearch
              Example: --services postgres,elasticsearch
  --liferay-version  Release key from https://releases-cdn.liferay.com/releases.json
                     Example: --liferay-version dxp-2026.q1.7-lts

Examples:
  ldev project init --list-liferay-versions
  ldev project init my-project
  ldev project init my-project --liferay-version dxp-2026.q1.7-lts --services postgres,elasticsearch
  ldev project init --dir ~/projects/my-project --liferay-version dxp-2026.q1.7-lts
  ldev project init --name my-project --dir .
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
    createFormattedArgumentAction(
      async (context, positionalDir: string | undefined, options: ProjectInitCommandOptions) => {
        if (options.listLiferayVersions || options.allLiferayVersions) {
          return listProjectInitLiferayVersions({all: Boolean(options.allLiferayVersions)});
        }

        const services = parseServices(options.services);
        const inputs = resolveProjectInitInputs(options, positionalDir);
        const result = await runProjectInit({
          name: inputs.name,
          targetDir: inputs.targetDir,
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

export function resolveProjectInitInputs(
  options: Pick<ProjectInitCommandOptions, 'name' | 'dir'>,
  positionalDir?: string,
): ResolvedProjectInitInputs {
  const targetDir = normalizeInput(options.dir) ?? normalizeInput(positionalDir) ?? normalizeInput(options.name);

  if (!targetDir) {
    throw new CliError('Missing project destination. Provide [dir], --dir <dir>, or --name <name>.', {
      code: 'PROJECT_INIT_DESTINATION_REQUIRED',
    });
  }

  const name = normalizeInput(options.name) ?? inferProjectNameFromDir(targetDir);
  return {name, targetDir};
}

function normalizeInput(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function inferProjectNameFromDir(targetDir: string): string {
  return path.basename(path.resolve(targetDir)) || 'liferay';
}

function parseServices(raw: string | undefined): DockerService[] {
  if (!raw) return [];
  const valid: DockerService[] = ['postgres', 'elasticsearch'];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DockerService => valid.includes(s as DockerService));
}
