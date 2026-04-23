import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {resolveGogoContext} from '../../core/runtime/gogo-command.js';

export {looksLikeTelnetBannerOnly, runGogoCommand, sanitizeGogoOutput} from '../../core/runtime/gogo-command.js';

export function resolveOsgiContext(config: AppConfig) {
  return resolveGogoContext(config);
}

export async function openInteractiveGogo(config: AppConfig, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  const context = resolveOsgiContext(config);
  await runDockerComposeOrThrow(context.dockerDir, ['exec', 'liferay', 'telnet', 'localhost', '11311'], {
    env: processEnv,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

export async function runLiferayScript(
  config: AppConfig,
  script: string,
  args: string[],
  processEnv?: NodeJS.ProcessEnv,
): Promise<void> {
  const context = resolveOsgiContext(config);
  await runDockerComposeOrThrow(context.dockerDir, ['exec', 'liferay', script, ...args], {env: processEnv});
}
