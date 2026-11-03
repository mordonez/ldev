import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {Command} from 'commander';

import type {CommandGroup} from './command-group.js';
import {COMMAND_GROUPS} from './command-groups.js';
import {resolveCommandRoot} from './command-context.js';
import {buildContextualRootHelp} from './contextual-help.js';
import {resolveOutputFormatFromArgv} from './errors.js';
import {parseJsonUnknown} from '../core/utils/json.js';

function isLdevPackageManifest(value: unknown): value is {version: string; bin?: Record<string, string>} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {version?: unknown; bin?: unknown};
  return typeof candidate.version === 'string' && Boolean(candidate.bin && typeof candidate.bin === 'object');
}

function readPackageVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = parseJsonUnknown(readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (isLdevPackageManifest(pkg) && pkg.bin?.ldev) {
        return pkg.version;
      }
    } catch {
      // not found, go up
    }
    dir = path.dirname(dir);
  }
  return '0.0.0';
}

const version = readPackageVersion();

export function createCli(
  cwd = process.cwd(),
  groups: CommandGroup[] = COMMAND_GROUPS,
  argv: string[] = process.argv,
): Command {
  const program = new Command();

  program
    .name('ldev')
    .version(version)
    .description('Liferay local development CLI')
    .option('--repo-root <path>', 'Resolve repo-local context from another checkout root')
    .enablePositionalOptions()
    .showHelpAfterError()
    .addHelpText(
      'after',
      () =>
        `\n${buildContextualRootHelp(resolveCommandRoot({cwd}, process.argv, process.env))}\n\nEnvironment: REPO_ROOT=<path> sets the default checkout root and is overridden by --repo-root.`,
    );

  for (const group of groups) {
    group.register(program);
  }

  routeUsageErrorsToCaller(program, resolveOutputFormatFromArgv(argv) !== 'text');

  return program;
}

/**
 * Make Commander throw instead of exiting so the entry point owns every exit path.
 * In machine-readable modes Commander's own stderr text is muted: the caller reports the
 * failure as the standard JSON error envelope instead of usage text an agent cannot parse.
 */
function routeUsageErrorsToCaller(command: Command, machineOutput: boolean): void {
  command.exitOverride();
  if (machineOutput) {
    command.configureOutput({writeErr: () => {}, outputError: () => {}});
  }
  for (const subcommand of command.commands) {
    routeUsageErrorsToCaller(subcommand, machineOutput);
  }
}
