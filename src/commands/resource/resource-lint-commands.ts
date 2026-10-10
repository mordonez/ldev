import type {Command} from 'commander';

import {registerResourceWorkflow} from './resource.command.js';
import {runLiferayResourceLintFragments} from '../../features/liferay/resource/liferay-resource-lint-fragments.js';
import {runLiferayResourceLintPageDefinition} from '../../features/liferay/resource/liferay-resource-lint-page-definition.js';
import {
  formatLiferayResourceLintResult,
  getLiferayResourceLintExitCode,
} from '../../features/liferay/resource/liferay-resource-lint-shared.js';

export function registerResourceLintCommands(resource: Command): void {
  registerResourceWorkflow(resource, {
    name: 'lint-page-definition',
    description:
      'Statically lint page-definition.json files (and ddm-structures XML) for silent Liferay authoring traps',
    configure: (command) =>
      command
        .option('--file <file>', 'Single page-definition.json (or ddm-structure XML) file to lint')
        .option('--dir <dir>', 'Directory to scan recursively for page-definition.json and ddm-structures/*.xml', '.'),
    run: async (_context, options) =>
      runLiferayResourceLintPageDefinition({
        file: options.file,
        dir: options.dir,
      }),
    render: {
      text: formatLiferayResourceLintResult,
      exitCode: getLiferayResourceLintExitCode,
    },
  });

  registerResourceWorkflow(resource, {
    name: 'lint-fragments',
    description: 'Statically lint fragment HTML for nested editables and other silently-invalid markup',
    configure: (command) =>
      command
        .option('--file <file>', 'Single fragment HTML file to lint')
        .option('--dir <dir>', 'Directory to scan recursively for fragments (fragment.json + HTML)', '.'),
    run: async (_context, options) =>
      runLiferayResourceLintFragments({
        file: options.file,
        dir: options.dir,
      }),
    render: {
      text: formatLiferayResourceLintResult,
      exitCode: getLiferayResourceLintExitCode,
    },
  });
}
