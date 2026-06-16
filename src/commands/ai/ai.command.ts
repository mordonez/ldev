import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatAiResult, runAiInstall} from '../../features/ai/ai-install.js';
import {parseBootstrapCacheTtl, runAiBootstrap} from '../../features/agent/agent-bootstrap.js';
type AiInstallCommandOptions = {
  target: string;
  force?: boolean;
};

type AiBootstrapCommandOptions = {
  intent: string;
  cache?: string;
};

export function createAiCommand(): Command {
  const command = new Command('ai');

  const installCommand = addOutputFormatOption(
    command
      .command('install')
      .description('Install standard AI meta-files into a project (AGENTS.md, CLAUDE.md, etc.)')
      .requiredOption('--target <target>', 'Project root')
      .option('--force', 'Overwrite existing files'),
  );

  const bootstrapCommand = addOutputFormatOption(
    command
      .command('bootstrap')
      .description('Aggregate context and targeted doctor checks for an agent intent')
      .requiredOption(
        '--intent <intent>',
        'Agent intent: discover, develop, deploy, troubleshoot, migrate-resources, osgi-debug',
      )
      .option(
        '--cache <seconds>',
        'Reuse a cached bootstrap result for the same intent + cwd while it is newer than this TTL',
      ),
    'json',
  );

  command.description('Standard AI assets and skills for ldev projects').addHelpText(
    'after',
    `
Skills are distributed via the skills.sh standard:
  npx skills add https://github.com/mordonez/ldev

Meta-file bootstrap:
  install              Install AGENTS.md, CLAUDE.md, and related files
  install --force      Overwrite existing files
`,
  );

  installCommand.action(
    createFormattedAction(
      async (_context, options: AiInstallCommandOptions) => {
        return runAiInstall({
          targetDir: options.target,
          force: Boolean(options.force),
        });
      },
      {text: formatAiResult},
    ),
  );

  bootstrapCommand.action(
    createFormattedAction(async (context, options: AiBootstrapCommandOptions) => {
      return runAiBootstrap(context.cwd, {
        intent: options.intent,
        config: context.config,
        env: process.env,
        cacheTtlSeconds: parseBootstrapCacheTtl(options.cache),
      });
    }),
  );

  return command;
}
