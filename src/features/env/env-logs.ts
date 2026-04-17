import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';

import {resolveEnvContext} from './env-files.js';

export type EnvLogsOptions = {
  follow?: boolean;
  since?: string;
  service?: string;
  processEnv?: NodeJS.ProcessEnv;
};

export type EnvLogsResult = {
  ok: true;
  service: string | null;
  follow: boolean;
  since: string | null;
};

export async function runEnvLogs(config: AppConfig, options?: EnvLogsOptions): Promise<EnvLogsResult> {
  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker and docker compose are required for env logs.', {code: 'ENV_CAPABILITY_MISSING'});
  }

  const args = ['logs'];
  if (options?.follow ?? true) {
    args.push('--follow');
  }
  if (options?.since) {
    args.push(`--since=${options.since}`);
  }
  if (options?.service) {
    args.push(options.service);
  }

  await runDockerComposeOrThrow(context.dockerDir, args, {
    env: options?.processEnv,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  return {
    ok: true,
    service: options?.service ?? null,
    follow: options?.follow ?? true,
    since: options?.since ?? null,
  };
}
