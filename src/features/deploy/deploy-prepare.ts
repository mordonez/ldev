import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {
  ensureGradleWrapper,
  resolveDeployContext,
  resolveHeadCommit,
  restoreTrackedServiceProperties,
  runDeployStep,
  runGradleTask,
  seedBuildDockerConfigs,
  shouldRunBuildService,
  syncArtifactsToDeployCache,
  listDeployArtifacts,
  writePrepareCommit,
} from './deploy-shared.js';

export type DeployPrepareResult = {
  ok: true;
  repoRoot: string;
  liferayDir: string;
  buildDir: string;
  targetCommit: string;
  buildServiceExecuted: boolean;
  dockerDeployExecuted: boolean;
  seededDockerenv: boolean;
  artifactsCopiedToCache: number;
  cacheDir: string;
};

export async function runDeployPrepare(config: AppConfig, options?: {printer?: Printer}): Promise<DeployPrepareResult> {
  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);

  const modulesDir = `${context.liferayDir}/modules`;
  const buildServiceExecuted = (await shouldRunBuildService(modulesDir))
    ? await runDeployStep(options?.printer, 'Ejecutando buildService', async () => {
        await runGradleTask(context, ['buildService', '-q']);
        await restoreTrackedServiceProperties(context.repoRoot);
        return true;
      })
    : false;

  await runDeployStep(options?.printer, 'Ejecutando dockerDeploy', async () => {
    await runGradleTask(context, ['dockerDeploy', '-Pliferay.workspace.environment=dockerenv', '-q']);
  });

  const seededDockerenv = await seedBuildDockerConfigs(context);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  await writePrepareCommit(context, targetCommit);
  const artifacts = await listDeployArtifacts(context.buildDeployDir);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);

  return {
    ok: true,
    repoRoot: context.repoRoot,
    liferayDir: context.liferayDir,
    buildDir: context.buildDir,
    targetCommit,
    buildServiceExecuted,
    dockerDeployExecuted: true,
    seededDockerenv,
    artifactsCopiedToCache: cache.copied,
    cacheDir: cache.cacheDir,
  };
}

export function formatDeployPrepare(result: DeployPrepareResult): string {
  return [
    `Build docker preparado: ${result.buildDir}`,
    `Commit preparado: ${result.targetCommit}`,
    `buildService: ${result.buildServiceExecuted ? 'ejecutado' : 'omitido'}`,
    `dockerDeploy: ${result.dockerDeployExecuted ? 'ejecutado' : 'omitido'}`,
    `dockerenv copiado: ${result.seededDockerenv ? 'sí' : 'no'}`,
    `artefactos en caché: ${result.artifactsCopiedToCache}`,
  ].join('\n');
}
