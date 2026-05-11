#!/usr/bin/env node
import {normalizeCliError, resolveOutputFormatFromArgv, toCliErrorPayload} from './cli/errors.js';
import {resolveCommandRoot} from './cli/command-context.js';
import {createCli} from './cli/create-cli.js';
import {buildContextualRootSummary} from './cli/contextual-help.js';
import {sanitizeErrorMessage} from './core/errors-sanitize.js';

async function main(): Promise<void> {
  const cli = createCli();
  if (process.argv.length <= 2) {
    process.stdout.write(
      Buffer.from(`${buildContextualRootSummary(resolveCommandRoot(undefined, process.argv, process.env))}\n`, 'utf8'),
    );
    return;
  }
  await cli.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const cliError = normalizeCliError(error);
  const safeMessage = sanitizeErrorMessage(cliError.message);
  const safeCliError = safeMessage === cliError.message ? cliError : {...cliError, message: safeMessage};
  const format = resolveOutputFormatFromArgv(process.argv);

  if (format === 'text') {
    process.stderr.write(Buffer.from(`${safeCliError.code}: ${safeCliError.message}\n`, 'utf8'));
  } else {
    process.stderr.write(
      Buffer.from(
        `${JSON.stringify(toCliErrorPayload(safeCliError), null, format === 'json' ? 2 : undefined)}\n`,
        'utf8',
      ),
    );
  }

  process.exit(safeCliError.exitCode);
});
