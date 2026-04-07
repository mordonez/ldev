import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {resolveDeployContext, restoreArtifactsFromDeployCache} from '../deploy/deploy-shared.js';

import {resolveEnvContext} from './env-files.js';
import {runEnvWait} from './env-wait.js';

export type EnvRecreateResult = {
  ok: true;
  portalUrl: string;
  waitedForHealth: boolean;
  restoredDeployArtifacts: number;
};

export async function runEnvRecreate(
  config: AppConfig,
  options?: {wait?: boolean; timeoutSeconds?: number; processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvRecreateResult> {
  const context = resolveEnvContext(config);
  let restoredDeployArtifacts = 0;

  if (config.repoRoot && config.liferayDir && config.dockerDir) {
    const deployContext = resolveDeployContext(config);
    const restoreResult = await restoreArtifactsFromDeployCache(config, deployContext);
    restoredDeployArtifacts = restoreResult.copied;
  }

  const recreateTask = async () => {
    await runDockerComposeOrThrow(context.dockerDir, ['stop', 'liferay'], {env: options?.processEnv});
    await runDockerComposeOrThrow(context.dockerDir, ['up', '-d', '--force-recreate', 'liferay'], {
      env: options?.processEnv,
    });
  };

  if (options?.printer) {
    await withProgress(options.printer, 'Recreating Liferay container', recreateTask);
  } else {
    await recreateTask();
  }

  if (options?.wait ?? true) {
    await runEnvWait(config, {
      timeoutSeconds: options?.timeoutSeconds ?? 250,
      pollIntervalSeconds: 5,
      processEnv: options?.processEnv,
      printer: options?.printer,
    });
  }

  return {
    ok: true,
    portalUrl: context.portalUrl,
    waitedForHealth: options?.wait ?? true,
    restoredDeployArtifacts,
  };
}

export function formatEnvRecreate(result: EnvRecreateResult): string {
  return [
    `Liferay container recreated`,
    `Portal URL: ${result.portalUrl}`,
    `Health wait: ${result.waitedForHealth ? 'yes' : 'no'}`,
    `Artifacts restored into build/docker/deploy: ${result.restoredDeployArtifacts}`,
  ].join('\n');
}
