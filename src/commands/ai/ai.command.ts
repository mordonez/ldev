import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {parseBootstrapCacheTtl, runAiBootstrap} from '../../features/agent/agent-bootstrap.js';

type AiBootstrapCommandOptions = {
  intent: string;
  cache?: string;
};

export function createAiCommand(): Command {
  const command = new Command('ai');

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

  command.description('Agent context and bootstrap for ldev projects').addHelpText(
    'after',
    `
Skills are distributed via the skills.sh standard:
  npx skills add https://github.com/mordonez/ldev

Agent meta-files (AGENTS.md, CLAUDE.md, etc.) live in docs/ai/ — copy them manually.
`,
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
