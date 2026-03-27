import {spawn} from 'node:child_process';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {resolveEnvContext} from './env-files.js';

export type EnvShellResult = {
  ok: true;
};

export async function runEnvShell(config: AppConfig, options?: {processEnv?: NodeJS.ProcessEnv}): Promise<EnvShellResult> {
  const context = resolveEnvContext(config);
  const child = spawn('docker', ['compose', 'exec', 'liferay', 'bash'], {
    cwd: context.dockerDir,
    env: options?.processEnv,
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new CliError('No se pudo abrir shell en el contenedor liferay.', {code: 'ENV_SHELL_FAILED'});
  }

  return {ok: true};
}
