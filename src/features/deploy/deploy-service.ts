import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';

import {
  ensureGradleWrapper,
  resolveDeployContext,
  restoreTrackedServiceProperties,
  runDeployStep,
  runGradleTask,
} from './deploy-shared.js';

export type DeployServiceResult = {
  ok: true;
  repoRoot: string;
  restoredTrackedFiles: boolean;
};

export async function runDeployService(config: AppConfig, options?: {printer?: Printer}): Promise<DeployServiceResult> {
  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);

  await runDeployStep(options?.printer, 'Ejecutando buildService', async () => {
    await runGradleTask(context, ['buildService', '-q']);
  });
  await restoreTrackedServiceProperties(context.repoRoot);

  return {
    ok: true,
    repoRoot: context.repoRoot,
    restoredTrackedFiles: true,
  };
}

export function formatDeployService(result: DeployServiceResult): string {
  return [
    `Service Builder ejecutado en: ${result.repoRoot}`,
    `service.properties restaurados: ${result.restoredTrackedFiles ? 'sí' : 'no'}`,
  ].join('\n');
}
