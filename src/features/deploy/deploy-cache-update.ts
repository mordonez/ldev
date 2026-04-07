import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';

import {
  currentArtifactCommit,
  ensureGradleWrapper,
  listDeployArtifacts,
  resolveDeployContext,
  runDeployStep,
  syncArtifactsToDeployCache,
} from './deploy-shared.js';

export type DeployCacheUpdateResult = {
  ok: true;
  sourceDir: string;
  cacheDir: string;
  copied: number;
  clean: boolean;
  commit: string;
};

export async function runDeployCacheUpdate(
  config: AppConfig,
  options?: {clean?: boolean; printer?: Printer},
): Promise<DeployCacheUpdateResult> {
  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);

  const artifacts = await listDeployArtifacts(context.buildDeployDir);
  if (artifacts.length === 0) {
    throw new CliError(`No artifacts were found in ${context.buildDeployDir}. Run 'ldev deploy prepare'.`, {
      code: 'DEPLOY_ARTIFACTS_NOT_FOUND',
    });
  }

  const cache = await runDeployStep(options?.printer, 'Updating deploy cache', async () =>
    syncArtifactsToDeployCache(config, context, artifacts, {clean: options?.clean}),
  );

  return {
    ok: true,
    sourceDir: context.buildDeployDir,
    cacheDir: cache.cacheDir,
    copied: cache.copied,
    clean: Boolean(options?.clean),
    commit: await currentArtifactCommit(context),
  };
}

export function formatDeployCacheUpdate(result: DeployCacheUpdateResult): string {
  return [
    `Deploy cache update OK: source=${result.sourceDir}`,
    `cache=${result.cacheDir}`,
    `copied=${result.copied}`,
    `clean=${result.clean}`,
    `commit=${result.commit}`,
  ].join(' ');
}
