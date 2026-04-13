import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerCompose} from '../../core/platform/docker.js';

import {looksLikeTelnetBannerOnly, runGogoCommand, sanitizeGogoOutput} from './osgi-shared.js';
import {resolveOsgiContext} from './osgi-shared.js';

export type OsgiStatusResult = {
  ok: true;
  bundle: string;
  output: string;
};

export async function runOsgiStatus(
  config: AppConfig,
  options: {bundle: string},
  processEnv?: NodeJS.ProcessEnv,
): Promise<OsgiStatusResult> {
  const bundle = options.bundle.trim();
  if (bundle === '') {
    throw new CliError('osgi status requires a bundle.', {code: 'OSGI_BUNDLE_REQUIRED'});
  }

  const rawOutput = config.dockerDir
    ? await runDockerLbStatus(config, processEnv)
    : await runGogoCommand(config, 'lb -s', processEnv);
  const filteredOutput = rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\|/.test(line))
    .filter((line) => line.toLowerCase().includes(bundle.toLowerCase()))
    .join('\n');

  if (filteredOutput === '') {
    throw new CliError(
      `Bundle not found: ${bundle}. Verify the bundle name is correct and it is installed/active in Gogo.`,
      {code: 'OSGI_BUNDLE_NOT_FOUND'},
    );
  }

  return {
    ok: true,
    bundle,
    output: filteredOutput,
  };
}

async function runDockerLbStatus(config: AppConfig, processEnv?: NodeJS.ProcessEnv): Promise<string> {
  const context = resolveOsgiContext(config);
  const result = await runDockerCompose(
    context.dockerDir,
    ['exec', '-T', 'liferay', 'sh', '-lc', "(echo 'lb -s'; sleep 1; echo disconnect) | telnet localhost 11311 || true"],
    {
      env: processEnv,
      reject: false,
      timeoutMs: 20_000,
    },
  );

  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || 'Could not execute lb -s in Gogo.', {
      code: 'OSGI_GOGO_ERROR',
    });
  }

  const cleaned = sanitizeGogoOutput(result.stdout);
  if (!looksLikeTelnetBannerOnly(cleaned)) {
    return cleaned;
  }

  throw new CliError(
    'Gogo shell returned only telnet banner without bundle list. Check Gogo connectivity and permissions.',
    {code: 'OSGI_GOGO_ERROR'},
  );
}

export function formatOsgiStatus(result: OsgiStatusResult): string {
  return result.output;
}
