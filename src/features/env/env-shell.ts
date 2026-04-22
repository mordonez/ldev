import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runInteractiveProcess} from '../../core/platform/process.js';
import {resolveEnvContext} from './env-files.js';

export type EnvShellResult = {
  ok: true;
};

export async function runEnvShell(
  config: AppConfig,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<EnvShellResult> {
  const context = resolveEnvContext(config);
  const result = await runInteractiveProcess('docker', ['compose', 'exec', 'liferay', 'bash'], {
    cwd: context.dockerDir,
    env: options?.processEnv,
  });

  if (!result.ok) {
    throw new CliError('Could not open a shell in the liferay container.', {code: 'ENV_SHELL_FAILED'});
  }

  return {ok: true};
}
