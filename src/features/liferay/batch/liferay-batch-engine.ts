/**
 * Liferay Batch Engine wrapper (headless-batch-engine v1.0).
 *
 * Wraps the asynchronous import/export task API:
 * - POST /o/headless-batch-engine/v1.0/import-tasks/{className}
 * - GET  /o/headless-batch-engine/v1.0/import-tasks/{id}
 * - GET  /o/headless-batch-engine/v1.0/import-tasks/{id}/failed-items
 * - POST /o/headless-batch-engine/v1.0/export-tasks/{className}/{contentType}
 * - GET  /o/headless-batch-engine/v1.0/export-tasks/{id}
 *
 * Follows the evidence-based contract of `ldev resource import-*`:
 * the reported result is always backed by a read-back of the task
 * (fresh executeStatus GET plus failed-items check for imports),
 * never by assuming the submit call succeeded.
 */

import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {sleep} from '../../../core/utils/async.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {
  BATCH_ENGINE_BASE_PATH,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_POLL_TIMEOUT_SECONDS,
  type BatchEngineDependencies,
  type LiferayBatchExportOptions,
  type LiferayBatchExportResult,
  type LiferayBatchFailedItem,
  type LiferayBatchImportOptions,
  type LiferayBatchImportResult,
  type LiferayBatchStatusOptions,
  type LiferayBatchStatusResult,
  type LiferayBatchTaskSnapshot,
  type PollOutcome,
} from './liferay-batch-types.js';

export {
  BATCH_ENGINE_BASE_PATH,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_POLL_TIMEOUT_SECONDS,
  type BatchEngineDependencies,
  type LiferayBatchExportOptions,
  type LiferayBatchExportResult,
  type LiferayBatchFailedItem,
  type LiferayBatchImportOptions,
  type LiferayBatchImportResult,
  type LiferayBatchStatusOptions,
  type LiferayBatchStatusResult,
  type LiferayBatchTaskSnapshot,
} from './liferay-batch-types.js';
export {
  formatLiferayBatchExport,
  formatLiferayBatchImport,
  formatLiferayBatchStatus,
  getLiferayBatchExportExitCode,
  getLiferayBatchImportExitCode,
  getLiferayBatchStatusExitCode,
} from './liferay-batch-format.js';

const TERMINAL_EXECUTE_STATUSES = new Set(['COMPLETED', 'FAILED']);
const CREATE_STRATEGIES = new Set(['INSERT', 'UPSERT']);
const IMPORT_STRATEGIES = new Set(['ON_ERROR_CONTINUE', 'ON_ERROR_FAIL']);

// ── Import ────────────────────────────────────────────────────────────────────

export async function runLiferayBatchImport(
  config: AppConfig,
  options: LiferayBatchImportOptions,
  dependencies?: BatchEngineDependencies,
): Promise<LiferayBatchImportResult> {
  const className = requireClassName(options.className);
  const createStrategy = normalizeChoice(options.createStrategy, CREATE_STRATEGIES, '--create-strategy');
  const importStrategy = normalizeChoice(options.importStrategy, IMPORT_STRATEGIES, '--import-strategy');
  const payload = await readImportPayload(options);
  const gateway = createGateway(config, dependencies);

  const query = buildQuery({
    createStrategy,
    importStrategy,
    externalReferenceCode: options.externalReferenceCode,
    fieldNameMapping: options.fieldNameMapping,
    taskItemDelegateName: options.taskItemDelegateName,
  });
  const submitPath = `${BATCH_ENGINE_BASE_PATH}/import-tasks/${encodeURIComponent(className)}${query}`;
  const submitted = toTaskSnapshot(
    await gateway.postJson<unknown>(submitPath, payload.data, 'batch-import-submit'),
    'batch-import-submit',
  );

  const poll = options.poll !== false;
  const outcome = poll
    ? await pollBatchTask(gateway, 'import-tasks', submitted.id, options, dependencies)
    : {task: submitted, pollAttempts: 0, elapsedMs: 0, timedOut: false};

  // Read-back verification: failed-items is checked whenever the task reached a
  // terminal state, so a COMPLETED status is only reported as verified when the
  // portal also reports zero failed items.
  const shouldCheckFailedItems = poll && TERMINAL_EXECUTE_STATUSES.has(outcome.task.executeStatus);
  const failedItems = shouldCheckFailedItems
    ? await fetchFailedItems(gateway, submitted.id)
    : {items: [], checked: false};

  const verified =
    poll && !outcome.timedOut && outcome.task.executeStatus === 'COMPLETED' && failedItems.checked
      ? failedItems.items.length === 0
      : false;

  return {
    operation: 'import',
    className,
    taskId: submitted.id,
    submittedItems: payload.itemCount,
    executeStatus: outcome.task.executeStatus,
    errorMessage: outcome.task.errorMessage,
    polled: poll,
    pollAttempts: outcome.pollAttempts,
    elapsedMs: outcome.elapsedMs,
    timedOut: outcome.timedOut,
    failedItems: failedItems.items,
    failedItemsChecked: failedItems.checked,
    verified,
    task: outcome.task,
  };
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function runLiferayBatchExport(
  config: AppConfig,
  options: LiferayBatchExportOptions,
  dependencies?: BatchEngineDependencies,
): Promise<LiferayBatchExportResult> {
  const className = requireClassName(options.className);
  const contentType = (options.contentType ?? 'JSON').trim();
  if (contentType === '') {
    throw LiferayErrors.batchError('--content-type must not be empty.');
  }

  const gateway = createGateway(config, dependencies);
  const query = buildQuery({
    fieldNames: options.fieldNames,
    taskItemDelegateName: options.taskItemDelegateName,
  });
  const submitPath =
    `${BATCH_ENGINE_BASE_PATH}/export-tasks/${encodeURIComponent(className)}/` +
    `${encodeURIComponent(contentType)}${query}`;
  const submitted = toTaskSnapshot(
    await gateway.postJson<unknown>(submitPath, {}, 'batch-export-submit'),
    'batch-export-submit',
  );

  const poll = Boolean(options.poll);
  const outcome = poll
    ? await pollBatchTask(gateway, 'export-tasks', submitted.id, options, dependencies)
    : {task: submitted, pollAttempts: 0, elapsedMs: 0, timedOut: false};

  return {
    operation: 'export',
    className,
    contentType,
    taskId: submitted.id,
    executeStatus: outcome.task.executeStatus,
    errorMessage: outcome.task.errorMessage,
    polled: poll,
    pollAttempts: outcome.pollAttempts,
    elapsedMs: outcome.elapsedMs,
    timedOut: outcome.timedOut,
    contentPath: outcome.task.executeStatus === 'COMPLETED' ? exportContentPath(submitted.id) : undefined,
    task: outcome.task,
  };
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function runLiferayBatchStatus(
  config: AppConfig,
  options: LiferayBatchStatusOptions,
  dependencies?: BatchEngineDependencies,
): Promise<LiferayBatchStatusResult> {
  if (!Number.isInteger(options.taskId) || options.taskId <= 0) {
    throw LiferayErrors.batchError('--task must be a positive integer.');
  }

  const operation = options.operation ?? 'import';
  const gateway = createGateway(config, dependencies);
  const basePath = operation === 'import' ? 'import-tasks' : 'export-tasks';
  const task = toTaskSnapshot(
    await gateway.getJson<unknown>(`${BATCH_ENGINE_BASE_PATH}/${basePath}/${options.taskId}`, 'batch-status'),
    'batch-status',
  );

  const failedItems =
    operation === 'import' && TERMINAL_EXECUTE_STATUSES.has(task.executeStatus)
      ? await fetchFailedItems(gateway, options.taskId)
      : {items: [], checked: false};

  return {
    operation,
    taskId: options.taskId,
    executeStatus: task.executeStatus,
    errorMessage: task.errorMessage,
    failedItems: failedItems.items,
    failedItemsChecked: failedItems.checked,
    contentPath:
      operation === 'export' && task.executeStatus === 'COMPLETED' ? exportContentPath(options.taskId) : undefined,
    task,
  };
}

// ── Shared internals ──────────────────────────────────────────────────────────

function createGateway(config: AppConfig, dependencies?: BatchEngineDependencies): LiferayGateway {
  return createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
}

function requireClassName(className: string | undefined): string {
  const normalized = className?.trim() ?? '';
  if (normalized === '') {
    throw LiferayErrors.batchError('--class-name is required (fully qualified DTO class name).');
  }

  return normalized;
}

function normalizeChoice(value: string | undefined, allowed: Set<string>, flag: string): string | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === undefined || normalized === '') {
    return undefined;
  }

  if (!allowed.has(normalized)) {
    throw LiferayErrors.batchError(`${flag} must be one of: ${[...allowed].join(', ')}.`);
  }

  return normalized;
}

async function readImportPayload(options: {file?: string; data?: string}): Promise<{data: unknown; itemCount: number}> {
  const file = options.file?.trim() ?? '';
  const inline = options.data?.trim() ?? '';

  if (file !== '' && inline !== '') {
    throw LiferayErrors.batchError('Use either --file or --data, not both.');
  }

  if (file === '' && inline === '') {
    throw LiferayErrors.batchError('One of --file or --data is required.');
  }

  let raw = inline;
  if (file !== '') {
    if (!(await fs.pathExists(file))) {
      throw LiferayErrors.resourceFileNotFound(file);
    }
    raw = await fs.readFile(file, 'utf8');
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw LiferayErrors.batchError(
      file !== '' ? `Batch payload is not valid JSON: ${file}.` : 'Batch payload passed via --data is not valid JSON.',
    );
  }

  return {data, itemCount: countPayloadItems(data)};
}

function countPayloadItems(payload: unknown): number {
  if (Array.isArray(payload)) {
    return payload.length;
  }

  if (payload !== null && typeof payload === 'object') {
    const items = (payload as {items?: unknown}).items;
    if (Array.isArray(items)) {
      return items.length;
    }
  }

  return 1;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const normalized = value?.trim() ?? '';
    if (normalized !== '') {
      search.set(key, normalized);
    }
  }

  const query = search.toString();
  return query === '' ? '' : `?${query}`;
}

function toTaskSnapshot(data: unknown, label: string): LiferayBatchTaskSnapshot {
  if (data === null || typeof data !== 'object') {
    throw LiferayErrors.batchError(`${label}: unexpected batch engine response (not a task object).`);
  }

  const record = data as Record<string, unknown>;
  const id =
    typeof record.id === 'number'
      ? record.id
      : typeof record.id === 'string'
        ? Number.parseInt(record.id, 10)
        : Number.NaN;
  if (!Number.isInteger(id) || id <= 0) {
    throw LiferayErrors.batchError(`${label}: batch engine response has no task id.`);
  }

  return {
    id,
    executeStatus: typeof record.executeStatus === 'string' ? record.executeStatus : 'UNKNOWN',
    errorMessage: asOptionalString(record.errorMessage),
    className: asOptionalString(record.className),
    contentType: asOptionalString(record.contentType),
    externalReferenceCode: asOptionalString(record.externalReferenceCode),
    operation: asOptionalString(record.operation),
    startTime: asOptionalString(record.startTime),
    endTime: asOptionalString(record.endTime),
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

async function pollBatchTask(
  gateway: LiferayGateway,
  basePath: 'import-tasks' | 'export-tasks',
  taskId: number,
  options: {pollIntervalSeconds?: number; pollTimeoutSeconds?: number},
  dependencies?: BatchEngineDependencies,
): Promise<PollOutcome> {
  const intervalSeconds = options.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
  const timeoutSeconds = options.pollTimeoutSeconds ?? DEFAULT_POLL_TIMEOUT_SECONDS;
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw LiferayErrors.batchError('--poll-interval must be a positive number of seconds.');
  }
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) {
    throw LiferayErrors.batchError('--poll-timeout must be a non-negative number of seconds.');
  }

  const sleepImpl = dependencies?.sleep ?? sleep;
  const now = dependencies?.now ?? Date.now;
  const start = now();
  const deadline = start + timeoutSeconds * 1000;
  let pollAttempts = 0;

  for (;;) {
    const task = toTaskSnapshot(
      await gateway.getJson<unknown>(`${BATCH_ENGINE_BASE_PATH}/${basePath}/${taskId}`, 'batch-poll'),
      'batch-poll',
    );
    pollAttempts += 1;

    if (TERMINAL_EXECUTE_STATUSES.has(task.executeStatus)) {
      return {task, pollAttempts, elapsedMs: now() - start, timedOut: false};
    }

    if (now() >= deadline) {
      return {task, pollAttempts, elapsedMs: now() - start, timedOut: true};
    }

    await sleepImpl(intervalSeconds * 1000);
  }
}

async function fetchFailedItems(
  gateway: LiferayGateway,
  taskId: number,
): Promise<{items: LiferayBatchFailedItem[]; checked: boolean}> {
  const response = await gateway.getRaw<unknown>(`${BATCH_ENGINE_BASE_PATH}/import-tasks/${taskId}/failed-items`);
  if (!response.ok) {
    // Older portals do not expose failed-items; report the status honestly
    // instead of failing the whole command after the task already finished.
    return {items: [], checked: false};
  }

  const data = response.data;
  const rawItems = Array.isArray(data)
    ? data
    : data !== null && typeof data === 'object' && Array.isArray((data as {items?: unknown}).items)
      ? (data as {items: unknown[]}).items
      : [];

  const items: LiferayBatchFailedItem[] = [];
  for (const raw of rawItems) {
    if (raw === null || typeof raw !== 'object') {
      continue;
    }
    const record = raw as Record<string, unknown>;
    items.push({
      itemIndex: typeof record.itemIndex === 'number' ? record.itemIndex : undefined,
      message: asOptionalString(record.message),
      item: asOptionalString(typeof record.item === 'string' ? record.item : JSON.stringify(record.item ?? '')),
    });
  }

  return {items, checked: true};
}

function exportContentPath(taskId: number): string {
  return `${BATCH_ENGINE_BASE_PATH}/export-tasks/${taskId}/content`;
}
