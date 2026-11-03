/**
 * `ldev deploy client-extension <name>`: build and deploy one workspace client
 * extension, wait until Liferay has started it and, for batch client
 * extensions, until every batch file has an outcome; then read the batch items
 * back by ERC. A batch CX bundle stays Active even when its import fails, so
 * the log outcome and the read-back are the proof, not the bundle state.
 */

import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {runDockerCompose} from '../../core/platform/docker.js';
import {
  clientExtensionsDir,
  listWorkspaceClientExtensions,
  parseClientExtensionLogEvents,
  readBundleStates,
  readWorkspaceClientExtension,
  type ClientExtensionLogEvent,
} from '../../core/runtime/client-extensions.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {DeployErrors} from '../deploy/errors/deploy-error-factory.js';
import {runDeployModule} from '../deploy/deploy-module.js';
import {
  readBackByErc,
  readBatchJobFile,
  resolveReadBackLookup,
  type BatchReadBack,
} from '../liferay/batch/liferay-batch-shared.js';
import type {ResourceDependencies} from '../liferay/resource/liferay-resource-artifact-shared.js';

export type ClientExtensionBatchOutcome = {
  file: string;
  status: 'imported' | 'failed' | 'pending';
  message: string | null;
  readBack: BatchReadBack | null;
};

export type DeployClientExtensionResult = {
  ok: true;
  name: string;
  types: string[];
  bundle: {symbolicName: string; id: number | null; state: string};
  hotDeployed: boolean;
  batch: ClientExtensionBatchOutcome[];
  events: ClientExtensionLogEvent[];
};

type DeployClientExtensionDependencies = ResourceDependencies & {
  deployModule?: typeof runDeployModule;
  readLogs?: (since: string) => Promise<string>;
  readBundleStates?: typeof readBundleStates;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export async function runDeployClientExtension(
  config: AppConfig,
  options: {name: string; timeoutSeconds?: number; printer?: Printer; processEnv?: NodeJS.ProcessEnv},
  dependencies?: DeployClientExtensionDependencies,
): Promise<DeployClientExtensionResult> {
  if (!config.liferayDir) {
    throw DeployErrors.workspaceRootNotFound('Could not detect liferay/ in the current project.');
  }

  const dir = path.join(clientExtensionsDir(config.liferayDir), options.name);
  if (!(await fs.pathExists(path.join(dir, 'client-extension.yaml')))) {
    const available = (await listWorkspaceClientExtensions(config.liferayDir)).map((cx) => cx.project);
    throw DeployErrors.moduleNotFound(
      `No client extension named ${options.name} in liferay/client-extensions.` +
        (available.length > 0 ? ` Available: ${available.join(', ')}.` : ''),
    );
  }

  const cx = await readWorkspaceClientExtension(dir);
  const now = dependencies?.now ?? Date.now;
  const sleep = dependencies?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const readLogs = dependencies?.readLogs ?? ((since: string) => readLiferayLogs(config, since, options.processEnv));
  const since = new Date(now() - 1000).toISOString();

  const deployed = await (dependencies?.deployModule ?? runDeployModule)(config, {
    module: cx.project,
    printer: options.printer,
  });

  const base = {
    ok: true as const,
    name: cx.project,
    types: cx.entries.map((entry) => entry.type),
    hotDeployed: deployed.hotDeployed,
  };
  if (!deployed.hotDeployed) {
    // Nothing to observe: the zip waits in build/docker/deploy for the next `ldev start`.
    return {
      ...base,
      bundle: {symbolicName: cx.bundleSymbolicName, id: null, state: 'NOT_RUNNING'},
      batch: cx.batchFiles.map((file) => ({file, status: 'pending', message: null, readBack: null})),
      events: [],
    };
  }

  const deadline = now() + (options.timeoutSeconds ?? 180) * 1000;
  let events: ClientExtensionLogEvent[] = [];
  for (;;) {
    events = parseClientExtensionLogEvents(await readLogs(since), cx.bundleSymbolicName);
    const started = events.some((event) => event.kind === 'started');
    const settled = cx.batchFiles.every((file) => batchEvent(events, file));
    if ((started && settled) || events.some((event) => event.kind === 'batch-failed')) {
      break;
    }
    if (now() >= deadline) {
      throw DeployErrors.clientExtensionTimeout(
        `Client extension ${cx.project} was deployed but Liferay did not ${started ? 'finish its batch imports' : 'start it'} in time; check \`ldev logs diagnose --since 5m\`.`,
        {details: {name: cx.project, bundle: cx.bundleSymbolicName, events}},
      );
    }
    await sleep(2000);
  }

  const bundleState = (await (dependencies?.readBundleStates ?? readBundleStates)(config, options.processEnv)).get(
    cx.bundleSymbolicName,
  );
  const batch: ClientExtensionBatchOutcome[] = [];
  for (const file of cx.batchFiles) {
    const event = batchEvent(events, file);
    const job = await readBatchJobFile(path.join(cx.dir, file), {});
    const readBack = await readBackByErc(job.items, await resolveReadBackLookup(config, job, dependencies));
    batch.push({
      file,
      status: event?.kind === 'batch-ok' ? 'imported' : event?.kind === 'batch-failed' ? 'failed' : 'pending',
      message: event?.kind === 'batch-failed' ? event.message : null,
      readBack,
    });
  }

  const result: DeployClientExtensionResult = {
    ...base,
    bundle: {
      symbolicName: cx.bundleSymbolicName,
      id: bundleState?.id ?? null,
      state: bundleState?.state ?? 'NOT_INSTALLED',
    },
    batch,
    events,
  };

  const problems = [
    result.bundle.state === 'Active' ? '' : `bundle ${cx.bundleSymbolicName} is ${result.bundle.state}`,
    ...batch.map((outcome) =>
      outcome.status === 'failed'
        ? `${outcome.file}: ${outcome.message ?? 'failed'}`
        : outcome.readBack && outcome.readBack.missing.length > 0
          ? `${outcome.file}: missing after import ${outcome.readBack.missing.join(', ')}`
          : '',
    ),
  ].filter(Boolean);
  if (problems.length > 0) {
    throw DeployErrors.clientExtensionFailed(
      `Client extension ${cx.project} did not deploy cleanly: ${problems.join('; ')}`,
      {
        details: result,
      },
    );
  }

  return result;
}

export function formatDeployClientExtension(result: DeployClientExtensionResult): string {
  return [
    `Client extension: ${result.name} (${result.types.join(', ') || 'unknown type'})`,
    `Bundle: ${result.bundle.symbolicName} ${result.bundle.state}${result.bundle.id === null ? '' : ` [${result.bundle.id}]`}`,
    ...(result.hotDeployed ? [] : ['Liferay is not running: deployed on the next `ldev start`']),
    ...result.batch.map(
      (outcome) =>
        `Batch ${outcome.file}: ${outcome.status}` +
        (outcome.readBack?.supported ? ` (read-back ${outcome.readBack.present.length} by ERC)` : ''),
    ),
  ].join('\n');
}

function batchEvent(events: ClientExtensionLogEvent[], file: string): ClientExtensionLogEvent | undefined {
  return [...events]
    .reverse()
    .find((event) => (event.kind === 'batch-ok' || event.kind === 'batch-failed') && event.file === file);
}

async function readLiferayLogs(config: AppConfig, since: string, processEnv?: NodeJS.ProcessEnv): Promise<string> {
  const context = resolveEnvContext(config);
  const result = await runDockerCompose(
    context.dockerDir,
    ['logs', '--no-color', '--no-log-prefix', `--since=${since}`, 'liferay'],
    {env: buildComposeEnv(context, {baseEnv: processEnv}), reject: false},
  );
  return result.stdout;
}
