/**
 * `ldev portal batch import`: submit a Batch Engine import task, wait for it,
 * surface failed items and read the items back by ERC.
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {resolveSite} from '../portal/site-resolution.js';
import type {ResourceDependencies} from '../resource/liferay-resource-artifact-shared.js';
import {
  readBackByErc,
  readBatchJobFile,
  resolveReadBackLookup,
  submitBatchImport,
  waitForBatchImportTask,
  type BatchCreateStrategy,
  type BatchFailedItem,
  type BatchImportStrategy,
  type BatchReadBack,
} from './liferay-batch-shared.js';

export type LiferayBatchImportResult = {
  status: 'checked' | 'completed';
  file: string;
  className: string;
  taskItemDelegateName: string | null;
  createStrategy: BatchCreateStrategy;
  importStrategy: BatchImportStrategy;
  totalItems: number;
  taskId: number | null;
  processedItemsCount: number | null;
  /** check-only: items that exist now (would be updated) / do not (would be created). */
  readBack: BatchReadBack;
};

export async function runLiferayBatchImport(
  config: AppConfig,
  options: {
    file: string;
    className?: string;
    taskItemDelegateName?: string;
    createStrategy?: BatchCreateStrategy;
    importStrategy?: BatchImportStrategy;
    site?: string;
    checkOnly?: boolean;
    timeoutSeconds?: number;
    pollIntervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayBatchImportResult> {
  const job = await readBatchJobFile(options.file, options);
  if (options.site) {
    job.siteId = (await resolveSite(config, options.site, dependencies)).id;
  }
  const lookup = await resolveReadBackLookup(config, job, dependencies);
  const base = {
    file: options.file,
    className: job.className,
    taskItemDelegateName: job.taskItemDelegateName ?? null,
    createStrategy: job.createStrategy,
    importStrategy: job.importStrategy,
    totalItems: job.items.length,
  };

  if (options.checkOnly) {
    const readBack = await readBackByErc(job.items, lookup);
    if (job.createStrategy === 'INSERT' && readBack.present.length > 0) {
      throw LiferayErrors.batchFailed(
        `createStrategy=INSERT would fail for items that already exist: ${readBack.present.join(', ')}. Use UPSERT.`,
        {details: {...base, readBack}},
      );
    }
    return {...base, status: 'checked', taskId: null, processedItemsCount: null, readBack};
  }

  const submitted = await submitBatchImport(config, job, dependencies);
  const task = await waitForBatchImportTask(
    config,
    submitted.id,
    {
      timeoutMs: (options.timeoutSeconds ?? 300) * 1000,
      pollIntervalMs: options.pollIntervalMs ?? 2000,
      sleep: options.sleep,
    },
    dependencies,
  );
  const readBack = await readBackByErc(job.items, lookup);
  const failedItems: BatchFailedItem[] = task.failedItems ?? [];

  if (task.executeStatus === 'FAILED' || failedItems.length > 0 || readBack.missing.length > 0) {
    const reasons = [
      task.executeStatus === 'FAILED'
        ? `task ${task.id} FAILED${task.errorMessage ? `: ${task.errorMessage}` : ''}`
        : '',
      failedItems.length > 0 ? `${failedItems.length} failed item(s)` : '',
      readBack.missing.length > 0 ? `missing after import: ${readBack.missing.join(', ')}` : '',
    ].filter(Boolean);
    throw LiferayErrors.batchFailed(
      `Batch import of ${job.className} did not apply cleanly (${reasons.join('; ')}).` +
        (readBack.present.length > 0 ? ` Already written: ${readBack.present.join(', ')}.` : ''),
      {
        details: {
          ...base,
          taskId: task.id,
          executeStatus: task.executeStatus,
          failedItems: failedItems.map((item) => ({itemIndex: item.itemIndex, message: item.message})),
          readBack,
        },
      },
    );
  }

  return {
    ...base,
    status: 'completed',
    taskId: task.id,
    processedItemsCount: task.processedItemsCount ?? null,
    readBack,
  };
}

export function formatLiferayBatchImport(result: LiferayBatchImportResult): string {
  const readBack = result.readBack.supported
    ? result.status === 'checked'
      ? `existing=${result.readBack.present.length} new=${result.readBack.missing.length}`
      : `read-back ok (${result.readBack.present.length} by ERC)`
    : 'read-back not supported for this class';
  return [
    `${result.status}\t${result.className}${result.taskItemDelegateName ? ` (${result.taskItemDelegateName})` : ''}`,
    `items=${result.totalItems} createStrategy=${result.createStrategy} importStrategy=${result.importStrategy}`,
    ...(result.taskId === null ? [] : [`task=${result.taskId} processed=${result.processedItemsCount ?? '?'}`]),
    readBack,
  ].join('\n');
}
