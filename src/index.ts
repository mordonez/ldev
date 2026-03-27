#!/usr/bin/env node
import {normalizeCliError, resolveOutputFormatFromArgv, toCliErrorPayload} from './cli/errors.js';
import {createCli} from './cli/create-cli.js';

async function main(): Promise<void> {
  const cli = createCli();
  await cli.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const cliError = normalizeCliError(error);
  const format = resolveOutputFormatFromArgv(process.argv);

  if (format === 'text') {
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`);
  } else {
    process.stderr.write(`${JSON.stringify(toCliErrorPayload(cliError), null, format === 'json' ? 2 : undefined)}\n`);
  }

  process.exit(cliError.exitCode);
});
