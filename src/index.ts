#!/usr/bin/env node
import {CommanderError} from 'commander';

import {normalizeCliError, resolveOutputFormatFromArgv, toCliErrorPayload} from './cli/errors.js';
import {resolveCommandRoot} from './cli/command-context.js';
import {createCli} from './cli/create-cli.js';
import {buildContextualRootSummary} from './cli/contextual-help.js';
import {sanitizeErrorMessage} from './core/errors-sanitize.js';

async function main(): Promise<void> {
  const cli = createCli();
  if (process.argv.length <= 2) {
    process.stdout.write(`${buildContextualRootSummary(resolveCommandRoot(undefined, process.argv, process.env))}\n`);
    return;
  }
  await cli.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const format = resolveOutputFormatFromArgv(process.argv);
  const cliError = normalizeCliError(error);

  // Help, version and text-mode usage errors were already printed by Commander.
  if (error instanceof CommanderError && (cliError.exitCode === 0 || format === 'text')) {
    process.exit(cliError.exitCode);
  }

  const safeMessage = sanitizeErrorMessage(cliError.message);
  const safeCliError = safeMessage === cliError.message ? cliError : {...cliError, message: safeMessage};

  if (format === 'text') {
    process.stderr.write(`${safeCliError.code}: ${safeCliError.message}\n`);
  } else {
    process.stderr.write(
      `${JSON.stringify(toCliErrorPayload(safeCliError), null, format === 'json' ? 2 : undefined)}\n`,
    );
  }

  process.exit(safeCliError.exitCode);
});
