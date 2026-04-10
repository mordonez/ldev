import {spawn} from 'node:child_process';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {normalizeProcessEnv} from '../../core/platform/process.js';
import {resolveEnvContext} from './env-files.js';

export type EnvShellResult = {
  ok: true;
};

export async function runEnvShell(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<EnvShellResult> {
  const context = resolveEnvContext(config);
  const normalizedEnv = normalizeProcessEnv(options?.processEnv);
  const child = spawn('docker', ['compose', 'exec', 'liferay', 'bash'], {
    cwd: context.dockerDir,
    env: normalizedEnv,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new CliError('Could not open a shell in the liferay container.', {code: 'ENV_SHELL_FAILED'});
  }

  return {ok: true};
}
