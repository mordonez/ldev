import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';

import {runGogoCommand} from './osgi-shared.js';
import {runOsgiStatus} from './osgi-status.js';

export type OsgiDiagResult = {
  ok: true;
  bundle: string;
  bundleId: string;
  output: string;
};

export async function runOsgiDiag(config: AppConfig, options: {bundle: string}): Promise<OsgiDiagResult> {
  const status = await runOsgiStatus(config, options);
  const bundleId = status.output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^[0-9]+\|/.test(line))
    ?.split('|', 1)[0];

  if (!bundleId) {
    throw new CliError(`Bundle not found: ${options.bundle}`, {code: 'OSGI_BUNDLE_NOT_FOUND'});
  }

  return {
    ok: true,
    bundle: options.bundle,
    bundleId,
    output: await runGogoCommand(config, `diag ${bundleId}`, process.env),
  };
}

export function formatOsgiDiag(result: OsgiDiagResult): string {
  return result.output;
}
