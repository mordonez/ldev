import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/print.js';

import {
  ensureGradleWrapper,
  resolveDeployContext,
  resolveHeadCommit,
  runDeployStep,
  runGradleTask,
  seedBuildDockerConfigs,
  syncArtifactsToDeployCache,
  listDeployArtifacts,
  writePrepareCommit,
} from './deploy-shared.js';

export type DeployAllResult = {
  ok: true;
  buildDir: string;
  targetCommit: string;
  seededDockerenv: boolean;
  artifactsCopiedToCache: number;
  cacheDir: string;
};

export async function runDeployAll(
  config: AppConfig,
  options?: {printer?: Printer},
): Promise<DeployAllResult> {
  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);

  await runDeployStep(options?.printer, 'Ejecutando dockerDeploy', async () => {
    await runGradleTask(context, ['dockerDeploy', '-Pliferay.workspace.environment=dockerenv']);
  });

  const seededDockerenv = await seedBuildDockerConfigs(context);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  await writePrepareCommit(context, targetCommit);
  const artifacts = await listDeployArtifacts(context.buildDeployDir);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);

  return {
    ok: true,
    buildDir: context.buildDir,
    targetCommit,
    seededDockerenv,
    artifactsCopiedToCache: cache.copied,
    cacheDir: cache.cacheDir,
  };
}

export function formatDeployAll(result: DeployAllResult): string {
  return [
    `Deploy completo ejecutado: ${result.buildDir}`,
    `Commit preparado: ${result.targetCommit}`,
    `dockerenv copiado: ${result.seededDockerenv ? 'sí' : 'no'}`,
    `artefactos en caché: ${result.artifactsCopiedToCache}`,
  ].join('\n');
}
