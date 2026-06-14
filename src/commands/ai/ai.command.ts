import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatAiResult, runAiInstall} from '../../features/ai/ai-install.js';
import {parseBootstrapCacheTtl, runAiBootstrap} from '../../features/agent/agent-bootstrap.js';
import {
  formatMcpSetup,
  runMcpSetup,
  type McpStrategy,
  type McpTool,
} from '../../entrypoints/mcp-server/mcp-server-setup.js';

type AiInstallCommandOptions = {
  target: string;
  force?: boolean;
};

type AiBootstrapCommandOptions = {
  intent: string;
  cache?: string;
};

type AiMcpSetupCommandOptions = {
  target: string;
  tool: McpTool;
  strategy?: McpStrategy;
};

export function createAiCommand(): Command {
  const command = new Command('ai');
  const installCommand = addOutputFormatOption(
    command
      .command('install')
      .description('Install the standard reusable AI assets into a project')
      .requiredOption('--target <target>', 'Project root')
      .option('--force', 'Overwrite AI files if they already exist'),
  );
  const mcpSetupCommand = addOutputFormatOption(
    command
      .command('mcp-setup')
      .description('Write the ldev MCP server config for your AI assistant')
      .requiredOption('--target <target>', 'Project root to write the config into')
      .requiredOption(
        '--tool <tool>',
        'AI assistant to configure: all, claude-code (.claude/mcp.json), cursor (.cursor/mcp.json), or vscode (.vscode/mcp.json)',
      ),
  ).option(
    '--strategy <strategy>',
    'Server launch strategy: global (ldev-mcp-server), local (node ./node_modules/...), or npx',
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

  command.description('Standard reusable AI assets and skills for ldev projects').addHelpText(
    'after',
    `
This namespace bootstraps the reusable AI surface for a project that uses ldev.

Potentially mutating:
  install              Install AGENTS.md and AI meta-files (CLAUDE.md, .cursorrules, etc.)
  install --force      Overwrite AI files if they already exist
`,
  );

  installCommand.action(
    createFormattedAction(
      async (context, options: AiInstallCommandOptions) => {
        const result = await runAiInstall({
          targetDir: options.target,
          force: Boolean(options.force),
        });
        return result;
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

  mcpSetupCommand.action(
    createFormattedAction(
      async (_context, options: AiMcpSetupCommandOptions) => {
        return runMcpSetup({targetDir: options.target, tool: options.tool, strategy: options.strategy});
      },
      {text: formatMcpSetup},
    ),
  );

  return command;
}
