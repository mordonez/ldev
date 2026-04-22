import path from 'node:path';

import fs from 'fs-extra';
import {z} from 'zod';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runProcess} from '../../core/platform/process.js';
import {readJsonUnknown} from '../../core/utils/json.js';
import {runDeployStatus} from '../deploy/deploy-status.js';

import {collectEnvStatus} from './env-health.js';
import {resolveEnvContext} from './env-files.js';

export type EnvDiffSnapshot = {
  capturedAt: string;
  portalReachable: boolean;
  liferayState: string | null;
  liferayHealth: string | null;
  serviceStates: Record<string, {state: string | null; health: string | null}>;
  deployedModules: Record<string, {state: string; version: string | null}>;
  resolvedBundles: string[];
};

export type EnvDiffResult = {
  ok: true;
  baselineFile: string;
  mode: 'baseline-written' | 'diff';
  baselineCapturedAt: string | null;
  currentCapturedAt: string;
  summary: {
    addedModules: string[];
    removedModules: string[];
    changedServices: string[];
    resolvedBundles: string[];
  };
};

const envDiffServiceStateSchema = z.object({
  state: z.string().nullable(),
  health: z.string().nullable(),
});
const envDiffDeployedModuleSchema = z.object({
  state: z.string(),
  version: z.string().nullable(),
});
const envDiffSnapshotSchema = z.object({
  capturedAt: z.string(),
  portalReachable: z.boolean(),
  liferayState: z.string().nullable(),
  liferayHealth: z.string().nullable(),
  serviceStates: z.record(z.string(), envDiffServiceStateSchema),
  deployedModules: z.record(z.string(), envDiffDeployedModuleSchema),
  resolvedBundles: z.array(z.string()),
}) satisfies z.ZodType<EnvDiffSnapshot>;

export async function runEnvDiff(
  config: AppConfig,
  options?: {baseline?: string; writeBaseline?: boolean; processEnv?: NodeJS.ProcessEnv},
): Promise<EnvDiffResult> {
  const baselineFile = resolveBaselineFile(config, options?.baseline);
  const current = await captureEnvSnapshot(config, options?.processEnv);

  if (options?.writeBaseline) {
    await fs.ensureDir(path.dirname(baselineFile));
    await fs.writeJson(baselineFile, current, {spaces: 2});

    return {
      ok: true,
      baselineFile,
      mode: 'baseline-written',
      baselineCapturedAt: current.capturedAt,
      currentCapturedAt: current.capturedAt,
      summary: {
        addedModules: [],
        removedModules: [],
        changedServices: [],
        resolvedBundles: current.resolvedBundles,
      },
    };
  }

  if (!(await fs.pathExists(baselineFile))) {
    throw new CliError(`No baseline exists for env diff: ${baselineFile}. Use --write-baseline first.`, {
      code: 'ENV_DIFF_BASELINE_NOT_FOUND',
    });
  }

  const baseline = await readEnvDiffSnapshot(baselineFile);

  const addedModules = Object.keys(current.deployedModules).filter((module) => !(module in baseline.deployedModules));
  const removedModules = Object.keys(baseline.deployedModules).filter((module) => !(module in current.deployedModules));

  const serviceNames = new Set([...Object.keys(baseline.serviceStates), ...Object.keys(current.serviceStates)]);
  const changedServices = [...serviceNames].filter((service) => {
    const left = baseline.serviceStates[service] ?? {state: null, health: null};
    const right = current.serviceStates[service] ?? {state: null, health: null};
    return left.state !== right.state || left.health !== right.health;
  });

  return {
    ok: true,
    baselineFile,
    mode: 'diff',
    baselineCapturedAt: baseline.capturedAt,
    currentCapturedAt: current.capturedAt,
    summary: {
      addedModules: addedModules.sort(),
      removedModules: removedModules.sort(),
      changedServices: changedServices.sort(),
      resolvedBundles: current.resolvedBundles,
    },
  };
}

async function readEnvDiffSnapshot(filePath: string): Promise<EnvDiffSnapshot> {
  return envDiffSnapshotSchema.parse(await readJsonUnknown(filePath));
}

export function formatEnvDiff(result: EnvDiffResult): string {
  if (result.mode === 'baseline-written') {
    return `Baseline escrita en ${result.baselineFile}\ncapturedAt=${result.currentCapturedAt}`;
  }

  return [
    `Baseline: ${result.baselineFile}`,
    `Baseline capturedAt: ${result.baselineCapturedAt ?? 'n/a'}`,
    `Current capturedAt: ${result.currentCapturedAt}`,
    `Added modules: ${result.summary.addedModules.length}`,
    `Removed modules: ${result.summary.removedModules.length}`,
    `Changed services: ${result.summary.changedServices.length}`,
    `Resolved bundles: ${result.summary.resolvedBundles.length}`,
  ].join('\n');
}

export async function captureEnvSnapshot(config: AppConfig, processEnv?: NodeJS.ProcessEnv): Promise<EnvDiffSnapshot> {
  const envContext = resolveEnvContext(config);
  const [envStatus, deployStatus, resolvedBundles] = await Promise.all([
    collectEnvStatus(envContext, {processEnv}),
    runDeployStatus(config, {processEnv}),
    listResolvedBundles(envContext.dockerDir, processEnv),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    portalReachable: envStatus.portalReachable,
    liferayState: envStatus.liferay?.state ?? null,
    liferayHealth: envStatus.liferay?.health ?? null,
    serviceStates: Object.fromEntries(
      envStatus.services.map((service) => [service.service, {state: service.state, health: service.health}]),
    ),
    deployedModules: Object.fromEntries(
      deployStatus.modules.map((module) => [module.name, {state: module.state, version: null}]),
    ),
    resolvedBundles,
  };
}

async function listResolvedBundles(dockerDir: string, processEnv?: NodeJS.ProcessEnv): Promise<string[]> {
  const result = await runProcess(
    'docker',
    ['compose', 'exec', '-T', 'liferay', 'sh', '-lc', 'echo "lb -s" | telnet localhost 11311 || true'],
    {cwd: dockerDir, env: processEnv, reject: false},
  );
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\|resolved\|/i.test(line))
    .map((line) => line.split('|').pop()?.trim() ?? '')
    .filter((line) => line !== '');
}

function resolveBaselineFile(config: AppConfig, explicitBaseline?: string): string {
  if (explicitBaseline?.trim()) {
    return path.resolve(explicitBaseline);
  }
  if (!config.repoRoot) {
    throw new CliError('env diff requires repo root to resolve the default baseline.', {
      code: 'ENV_DIFF_REPO_REQUIRED',
    });
  }

  return path.join(config.repoRoot, '.ldev', 'env-baseline.json');
}
