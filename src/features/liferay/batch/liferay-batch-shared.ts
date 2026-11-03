/**
 * Liferay Batch Engine (headless-batch-engine v1.0) import tasks.
 *
 * Behaviour verified on DXP 2026.q3: a task with ON_ERROR_CONTINUE ends
 * COMPLETED with `failedItems`; ON_ERROR_FAIL ends FAILED but items before the
 * failing one are already written (not transactional); an unknown className is
 * a bare HTTP 500.
 */

import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway, isGatewayStatus} from '../liferay-gateway.js';
import type {ResourceDependencies} from '../resource/liferay-resource-artifact-shared.js';
import {getOrNull} from '../resource/liferay-resource-headless-shared.js';
import {getObjectDefinitionByErc, listObjectDefinitions} from '../resource/liferay-resource-object-shared.js';
import {isRecord, textOf} from '../resource/liferay-resource-object-diff.js';
import {getPicklistByErc} from '../resource/liferay-resource-picklist-shared.js';

export const BATCH_ENGINE_BASE = '/o/headless-batch-engine/v1.0';

export type BatchCreateStrategy = 'INSERT' | 'UPSERT';
export type BatchImportStrategy = 'ON_ERROR_CONTINUE' | 'ON_ERROR_FAIL';
export type BatchExecuteStatus = 'INITIAL' | 'STARTED' | 'COMPLETED' | 'FAILED';

export type BatchFailedItem = {itemIndex: number; message: string; item: string};

export type BatchImportTask = {
  id: number;
  className: string;
  executeStatus: BatchExecuteStatus;
  errorMessage?: string;
  failedItems?: BatchFailedItem[];
  processedItemsCount?: number;
  totalItemsCount?: number;
  startTime?: string;
  endTime?: string;
};

export type BatchJob = {
  className: string;
  taskItemDelegateName?: string;
  createStrategy: BatchCreateStrategy;
  importStrategy: BatchImportStrategy;
  siteId?: number;
  items: Record<string, unknown>[];
};

/**
 * Read a plain JSON array of items, or a `*.batch-engine-data.json` file as
 * shipped in `batch` client extensions ({configuration, items}).
 */
export async function readBatchJobFile(
  file: string,
  overrides: {
    className?: string;
    taskItemDelegateName?: string;
    createStrategy?: BatchCreateStrategy;
    importStrategy?: BatchImportStrategy;
  },
): Promise<BatchJob> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw LiferayErrors.configError(`Invalid batch JSON in ${file}: ${String(error)}`);
  }

  const configuration = isRecord(parsed) && isRecord(parsed.configuration) ? parsed.configuration : {};
  const parameters = isRecord(configuration.parameters) ? configuration.parameters : {};
  const rawItems: unknown = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.items : undefined;
  if (!Array.isArray(rawItems) || !rawItems.every(isRecord)) {
    throw LiferayErrors.configError(
      `${path.basename(file)} must be a JSON array of items or a batch-engine-data file with "items"`,
    );
  }

  const className = overrides.className ?? textOf(configuration.className);
  if (className === '') {
    throw LiferayErrors.configError(`No className for ${path.basename(file)}: pass --class-name`);
  }

  const siteId = Number(parameters.siteId ?? configuration.siteId);
  return {
    className,
    taskItemDelegateName: overrides.taskItemDelegateName ?? (textOf(configuration.taskItemDelegateName) || undefined),
    createStrategy:
      overrides.createStrategy ?? ((textOf(parameters.createStrategy) || 'UPSERT') as BatchCreateStrategy),
    importStrategy:
      overrides.importStrategy ?? ((textOf(parameters.importStrategy) || 'ON_ERROR_FAIL') as BatchImportStrategy),
    siteId: Number.isFinite(siteId) && siteId > 0 ? siteId : undefined,
    items: rawItems,
  };
}

export async function submitBatchImport(
  config: AppConfig,
  job: BatchJob,
  dependencies?: ResourceDependencies,
): Promise<BatchImportTask> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const query = new URLSearchParams({createStrategy: job.createStrategy, importStrategy: job.importStrategy});
  if (job.taskItemDelegateName) {
    query.set('taskItemDelegateName', job.taskItemDelegateName);
  }
  if (job.siteId) {
    query.set('siteId', String(job.siteId));
  }

  try {
    return await gateway.postJson<BatchImportTask>(
      `${BATCH_ENGINE_BASE}/import-task/${encodeURIComponent(job.className)}?${query.toString()}`,
      job.items,
      'batch-import-submit',
    );
  } catch (error) {
    if (isGatewayStatus(error, 500)) {
      throw LiferayErrors.batchFailed(
        `Batch Engine rejected ${job.className}${job.taskItemDelegateName ? ` (${job.taskItemDelegateName})` : ''}: ` +
          'the class is not a registered batch item, or the payload could not be read.',
        {details: {className: job.className, taskItemDelegateName: job.taskItemDelegateName}},
      );
    }
    throw error;
  }
}

export async function getBatchImportTask(
  config: AppConfig,
  taskId: number | string,
  dependencies?: ResourceDependencies,
): Promise<BatchImportTask> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  return gateway.getJson<BatchImportTask>(`${BATCH_ENGINE_BASE}/import-task/${taskId}`, 'batch-import-status');
}

/** Poll executeStatus until COMPLETED/FAILED. Throws LIFERAY_BATCH_TIMEOUT with the task id otherwise. */
export async function waitForBatchImportTask(
  config: AppConfig,
  taskId: number,
  options: {timeoutMs: number; pollIntervalMs: number; sleep?: (ms: number) => Promise<void>},
  dependencies?: ResourceDependencies,
): Promise<BatchImportTask> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + options.timeoutMs;

  for (;;) {
    const task = await getBatchImportTask(config, taskId, dependencies);
    if (task.executeStatus === 'COMPLETED' || task.executeStatus === 'FAILED') {
      return task;
    }
    if (Date.now() >= deadline) {
      throw LiferayErrors.batchTimeout(
        `Batch import task ${taskId} is still ${task.executeStatus}; check it with \`ldev portal batch status --task ${taskId}\`.`,
        {details: {taskId, executeStatus: task.executeStatus}},
      );
    }
    await sleep(options.pollIntervalMs);
  }
}

// ── Read-back by ERC ────────────────────────────────────────────────────────

export type BatchReadBack = {
  supported: boolean;
  present: string[];
  missing: string[];
};

type ReadBackLookup = (externalReferenceCode: string) => Promise<boolean>;

/**
 * Build an existence check for the item type, keyed by ERC. Returns null for
 * classes without a known by-ERC endpoint.
 */
export async function resolveReadBackLookup(
  config: AppConfig,
  job: Pick<BatchJob, 'className' | 'taskItemDelegateName' | 'siteId'>,
  dependencies?: ResourceDependencies,
): Promise<ReadBackLookup | null> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const exists = (urlPath: string) => async () =>
    (await getOrNull(() => gateway.getJson<unknown>(urlPath, 'batch-read-back'))) !== null;
  const simpleName = job.className.split('.').at(-1);

  switch (simpleName) {
    case 'ObjectDefinition':
      return async (erc) => (await getObjectDefinitionByErc(config, erc, dependencies)) !== null;
    case 'ListTypeDefinition':
      return async (erc) => (await getPicklistByErc(config, erc, dependencies)) !== null;
    case 'TaxonomyVocabulary':
      return job.siteId
        ? (erc) =>
            exists(
              `/o/headless-admin-taxonomy/v1.0/sites/${job.siteId}/taxonomy-vocabularies/by-external-reference-code/${encodeURIComponent(erc)}`,
            )()
        : null;
    case 'ObjectEntry': {
      const restContextPath = await resolveObjectRestContextPath(config, job.taskItemDelegateName, dependencies);
      return restContextPath
        ? (erc) => exists(`${restContextPath}/by-external-reference-code/${encodeURIComponent(erc)}`)()
        : null;
    }
    default:
      return null;
  }
}

export async function readBackByErc(
  items: Record<string, unknown>[],
  lookup: ReadBackLookup | null,
): Promise<BatchReadBack> {
  const ercs = items.map((item) => textOf(item.externalReferenceCode)).filter((erc) => erc !== '');
  if (!lookup) {
    return {supported: false, present: [], missing: []};
  }

  const present: string[] = [];
  const missing: string[] = [];
  for (const erc of ercs) {
    ((await lookup(erc)) ? present : missing).push(erc);
  }
  return {supported: true, present, missing};
}

/** `C_Course` -> `/o/c/courses`, from the object definition's restContextPath. */
async function resolveObjectRestContextPath(
  config: AppConfig,
  taskItemDelegateName: string | undefined,
  dependencies?: ResourceDependencies,
): Promise<string | null> {
  const name = (taskItemDelegateName ?? '').replace(/^C_/, '');
  if (name === '') {
    return null;
  }
  const definition =
    (await getObjectDefinitionByErc(config, name, dependencies)) ??
    (await listObjectDefinitions(config, dependencies)).find(
      (item) => textOf(item.name).toLowerCase() === name.toLowerCase(),
    );
  const restContextPath = textOf(definition?.restContextPath);
  return restContextPath === '' ? null : restContextPath;
}
