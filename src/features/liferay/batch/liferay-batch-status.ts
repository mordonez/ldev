import type {AppConfig} from '../../../core/config/load-config.js';
import type {ResourceDependencies} from '../resource/liferay-resource-artifact-shared.js';
import {getBatchImportTask, type BatchImportTask} from './liferay-batch-shared.js';

export async function runLiferayBatchStatus(
  config: AppConfig,
  options: {taskId: string},
  dependencies?: ResourceDependencies,
): Promise<BatchImportTask> {
  return getBatchImportTask(config, options.taskId, dependencies);
}

export function formatLiferayBatchStatus(task: BatchImportTask): string {
  return [
    `task=${task.id}\t${task.executeStatus}\t${task.className}`,
    `processed=${task.processedItemsCount ?? 0}/${task.totalItemsCount ?? 0}`,
    ...(task.errorMessage ? [`error=${task.errorMessage}`] : []),
    ...(task.failedItems ?? []).map((item) => `failed item ${item.itemIndex}: ${item.message}`),
  ].join('\n');
}
