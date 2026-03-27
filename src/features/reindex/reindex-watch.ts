import type {AppConfig} from '../../core/config/load-config.js';

import {runReindexStatus, type ReindexStatusResult} from './reindex-status.js';

export type ReindexWatchResult = {
  ok: true;
  intervalSeconds: number;
  iterations: number;
  snapshots: ReindexStatusResult[];
};

export async function runReindexWatch(
  config: AppConfig,
  options?: {intervalSeconds?: number; iterations?: number},
): Promise<ReindexWatchResult> {
  const intervalSeconds = options?.intervalSeconds ?? 5;
  const iterations = options?.iterations ?? 60;
  const snapshots: ReindexStatusResult[] = [];

  for (let i = 0; i < iterations; i += 1) {
    snapshots.push(await runReindexStatus(config));
    if (i + 1 < iterations) {
      await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
    }
  }

  return {
    ok: true,
    intervalSeconds,
    iterations,
    snapshots,
  };
}

export function formatReindexWatch(result: ReindexWatchResult): string {
  return result.snapshots
    .map((snapshot, index) => {
      const body = snapshot.rows.length === 0
        ? `Sin indices journal/liferay visibles en ${snapshot.esUrl}`
        : snapshot.rows.map((row) => `${row.health} ${row.status} ${row.index} ${row.docsCount}`).join('\n');
      return `[${index + 1}/${result.iterations}] ${body}`;
    })
    .join('\n');
}
