import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {Command} from 'commander';

import type {LdevPlugin} from './plugin.js';
import {BUILTIN_PLUGINS} from './builtin-plugins.js';
import {ROOT_HELP_SECTIONS} from './command-registry.js';

function readPackageVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === 'ldev') return pkg.version as string;
    } catch {
      // not found, go up
    }
    dir = path.dirname(dir);
  }
  return '0.0.0';
}

const version = readPackageVersion();

export function createCli(plugins: LdevPlugin[] = BUILTIN_PLUGINS): Command {
  const program = new Command();

  program
    .name('ldev')
    .version(version)
    .description('Official Liferay local development CLI')
    .showHelpAfterError()
    .addHelpText(
      'after',
      `
Quick start:
  ${ROOT_HELP_SECTIONS.quickStart.join('\n  ')}

Happy path:
  Use the top-level commands for daily local development.
  Drop into namespaces only when you need explicit workspace, runtime or Liferay operations.

For scripting and automation:
  ${ROOT_HELP_SECTIONS.automationContract.join('\n  ')}

Examples:
  ${ROOT_HELP_SECTIONS.examples.join('\n  ')}
`,
    );

  for (const plugin of plugins) {
    plugin.register(program);
  }

  return program;
}
