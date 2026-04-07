import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';

import {runGogoCommand} from './osgi-shared.js';

export type OsgiStatusResult = {
  ok: true;
  bundle: string;
  output: string;
};

export async function runOsgiStatus(config: AppConfig, options: {bundle: string}): Promise<OsgiStatusResult> {
  const bundle = options.bundle.trim();
  if (bundle === '') {
    throw new CliError('osgi status requires a bundle.', {code: 'OSGI_BUNDLE_REQUIRED'});
  }

  return {
    ok: true,
    bundle,
    output: await runGogoCommand(config, `lb | grep ${bundle}`, process.env),
  };
}

export function formatOsgiStatus(result: OsgiStatusResult): string {
  return result.output;
}
