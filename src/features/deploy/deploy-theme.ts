import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';

import {
  collectModuleArtifacts,
  ensureDeployArtifactsFound,
  ensureGradleWrapper,
  resolveDeployContext,
  resolveHeadCommit,
  runDeployStep,
  runGradleTask,
  syncArtifactsToBuildDeploy,
  syncArtifactsToDeployCache,
  writePrepareCommit,
} from './deploy-shared.js';

export type DeployThemeResult = {
  ok: true;
  theme: string;
  artifactsCopiedToBuild: number;
  artifactsCopiedToCache: number;
  cacheDir: string;
  targetCommit: string;
};

export async function runDeployTheme(
  config: AppConfig,
  options?: {theme?: string; printer?: Printer},
): Promise<DeployThemeResult> {
  const theme = options?.theme?.trim() || 'ub-theme';
  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);

  await runDeployStep(options?.printer, `Desplegando tema ${theme}`, async () => {
    await runGradleTask(context, [`:themes:${theme}:dockerDeploy`, '-q']);
  });

  const artifacts = await collectModuleArtifacts(context, theme);
  ensureDeployArtifactsFound(artifacts, theme);

  const artifactsCopiedToBuild = await syncArtifactsToBuildDeploy(context, artifacts);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  await writePrepareCommit(context, targetCommit);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);

  return {
    ok: true,
    theme,
    artifactsCopiedToBuild,
    artifactsCopiedToCache: cache.copied,
    cacheDir: cache.cacheDir,
    targetCommit,
  };
}

export function formatDeployTheme(result: DeployThemeResult): string {
  return [
    `Tema desplegado: ${result.theme}`,
    `Artefactos en build/docker/deploy: ${result.artifactsCopiedToBuild}`,
    `Artefactos en caché: ${result.artifactsCopiedToCache}`,
    `Commit preparado: ${result.targetCommit}`,
  ].join('\n');
}
