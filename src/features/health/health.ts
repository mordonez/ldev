import os from 'node:os';

import type {AppConfig} from '../../core/config/load-config.js';
import {measureHttpLatency} from '../../core/http/latency.js';
import {runProcess} from '../../core/platform/process.js';
import {parseLines} from '../../core/utils/text.js';
import {collectEnvStatus} from '../env/env-health.js';
import {resolveEnvContext} from '../env/env-files.js';

export type HealthResult = {
  ok: true;
  overall: 'healthy' | 'degraded';
  services: Awaited<ReturnType<typeof collectEnvStatus>>['services'];
  api: {
    reachable: boolean;
    latencyMs: number | null;
  };
  liferay: {
    state: string | null;
    health: string | null;
  };
  elasticsearch: {
    status: string;
  };
  disk: {
    usedPct: number | null;
    path: string;
  };
};

export async function runHealth(config: AppConfig, options?: {processEnv?: NodeJS.ProcessEnv}): Promise<HealthResult> {
  const context = resolveEnvContext(config);
  const [envStatus, disk] = await Promise.all([collectEnvStatus(context, options), readDiskUsage(context.dataRoot)]);
  const latencyMs = envStatus.portalReachable ? await measureHttpLatency(`${context.portalUrl}/c/portal/login`) : null;
  const overall =
    envStatus.portalReachable &&
    (envStatus.liferay?.health === 'healthy' ||
      (envStatus.liferay?.state === 'running' && envStatus.liferay.health === null))
      ? 'healthy'
      : 'degraded';

  return {
    ok: true,
    overall,
    services: envStatus.services,
    api: {
      reachable: envStatus.portalReachable,
      latencyMs,
    },
    liferay: {
      state: envStatus.liferay?.state ?? null,
      health: envStatus.liferay?.health ?? null,
    },
    elasticsearch: {
      status: envStatus.services.find((service) => service.service === 'elasticsearch')?.health ?? 'unknown',
    },
    disk,
  };
}

export function formatHealth(result: HealthResult): string {
  return [
    `Overall: ${result.overall}`,
    `API reachable: ${result.api.reachable}`,
    `API latency: ${result.api.latencyMs ?? 'n/a'} ms`,
    `Liferay: ${result.liferay.state ?? 'unknown'} / ${result.liferay.health ?? 'n/a'}`,
    `Disk used: ${result.disk.usedPct ?? 'n/a'}%`,
  ].join('\n');
}

async function readDiskUsage(targetPath: string): Promise<{usedPct: number | null; path: string}> {
  if (os.platform() === 'win32') {
    return {usedPct: null, path: targetPath};
  }

  const result = await runProcess('df', ['-P', targetPath], {reject: false});
  if (!result.ok) {
    return {usedPct: null, path: targetPath};
  }

  const line = parseLines(result.stdout)[1];

  if (!line) {
    return {usedPct: null, path: targetPath};
  }

  const columns = line.split(/\s+/);
  const usedPct = Number.parseInt(columns[4]?.replace('%', '') ?? '', 10);

  return {
    usedPct: Number.isFinite(usedPct) ? usedPct : null,
    path: targetPath,
  };
}
