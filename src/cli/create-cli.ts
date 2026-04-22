import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {Command} from 'commander';

import type {CommandGroup} from './command-group.js';
import {COMMAND_GROUPS} from './command-groups.js';
import {buildContextualRootHelp} from './contextual-help.js';
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

export function createCli(cwd = process.cwd(), groups: CommandGroup[] = COMMAND_GROUPS): Command {
  const program = new Command();

  program
    .name('ldev')
    .version(version)
    .description('Liferay local development CLI')
    .enablePositionalOptions()
    .showHelpAfterError()
    .addHelpText('after', () => `\n${buildContextualRootHelp(cwd)}`);

  for (const group of groups) {
    group.register(program);
  }

  return program;
}
