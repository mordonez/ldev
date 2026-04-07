import type {AppConfig} from '../../core/config/load-config.js';
import type {OutputFormat} from '../../core/output/formats.js';

import {runReindexStatus, type ReindexStatusResult} from './reindex-status.js';

export type ReindexWatchResult = {
  ok: true;
  intervalSeconds: number;
  iterations: number;
  snapshots: ReindexStatusResult[];
};

export async function runReindexWatch(
  config: AppConfig,
  options?: {
    intervalSeconds?: number;
    iterations?: number;
    onSnapshot?: (snapshot: ReindexStatusResult, meta: {index: number; iterations: number}) => void | Promise<void>;
  },
): Promise<ReindexWatchResult> {
  const intervalSeconds = options?.intervalSeconds ?? 5;
  const iterations = options?.iterations ?? 60;
  const snapshots: ReindexStatusResult[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const snapshot = await runReindexStatus(config);
    snapshots.push(snapshot);
    await options?.onSnapshot?.(snapshot, {index: i, iterations});
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
    .map((snapshot, index) => formatReindexWatchSnapshot(snapshot, {index, iterations: result.iterations}))
    .join('\n');
}

export function formatReindexWatchSnapshot(
  snapshot: ReindexStatusResult,
  meta: {index: number; iterations: number},
): string {
  const body =
    snapshot.rows.length === 0
      ? `Sin indices journal/liferay visibles en ${snapshot.esUrl}`
      : snapshot.rows.map((row) => `${row.health} ${row.status} ${row.index} ${row.docsCount}`).join('\n');
  return `[${meta.index + 1}/${meta.iterations}] ${body}`;
}

export function shouldStreamReindexWatch(format: OutputFormat): boolean {
  return format === 'text' || format === 'ndjson';
}
