import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {Command} from 'commander';

import type {CommandGroup} from './command-group.js';
import {COMMAND_GROUPS} from './command-groups.js';
import {buildContextualRootHelp} from './contextual-help.js';

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
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
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

export function createCli(cwd = process.cwd(), groups: CommandGroup[] = COMMAND_GROUPS): Command {
  const program = new Command();

  program
    .name('ldev')
    .version(version)
    .description('Liferay local development CLI')
    .option('--liferay-url <url>', 'Override Liferay base URL for this command')
    .option('--liferay-client-id <clientId>', 'Override Liferay OAuth2 client id for this command')
    .option(
      '--liferay-client-secret <clientSecret>',
      'Override Liferay OAuth2 client secret for this command (less secure; prefer --liferay-client-secret-env)',
    )
    .option(
      '--liferay-client-secret-env <envVar>',
      'Read Liferay OAuth2 client secret from an environment variable (recommended)',
    )
    .option('--liferay-scope-aliases <aliases>', 'Override OAuth2 scope aliases (comma-separated) for this command')
    .option('--liferay-timeout-seconds <seconds>', 'Override Liferay HTTP timeout in seconds for this command')
    .enablePositionalOptions()
    .showHelpAfterError()
    .addHelpText(
      'after',
      '\nOverride precedence: --liferay-client-secret has priority over --liferay-client-secret-env.\n' +
        'Security tip: prefer --liferay-client-secret-env in local shells and CI to avoid exposing secrets in process args/history.\n',
    )
    .addHelpText('after', () => `\n${buildContextualRootHelp(cwd)}`);

  for (const group of groups) {
    group.register(program);
  }

  return program;
}
