/**
 * Shared types for the Liferay Batch Engine wrapper (headless-batch-engine v1.0).
 */

import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';

export const BATCH_ENGINE_BASE_PATH = '/o/headless-batch-engine/v1.0';

export const DEFAULT_POLL_INTERVAL_SECONDS = 2;
export const DEFAULT_POLL_TIMEOUT_SECONDS = 300;

export type BatchEngineDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type LiferayBatchTaskSnapshot = {
  id: number;
  executeStatus: string;
  errorMessage?: string;
  className?: string;
  contentType?: string;
  externalReferenceCode?: string;
  operation?: string;
  startTime?: string;
  endTime?: string;
};

export type LiferayBatchFailedItem = {
  itemIndex?: number;
  message?: string;
  item?: string;
};

export type PollOutcome = {
  task: LiferayBatchTaskSnapshot;
  pollAttempts: number;
  elapsedMs: number;
  timedOut: boolean;
};

export type LiferayBatchImportOptions = {
  className: string;
  file?: string;
  data?: string;
  createStrategy?: string;
  importStrategy?: string;
  externalReferenceCode?: string;
  fieldNameMapping?: string;
  taskItemDelegateName?: string;
  poll?: boolean;
  pollIntervalSeconds?: number;
  pollTimeoutSeconds?: number;
};

export type LiferayBatchImportResult = {
  operation: 'import';
  className: string;
  taskId: number;
  submittedItems: number;
  executeStatus: string;
  errorMessage?: string;
  polled: boolean;
  pollAttempts: number;
  elapsedMs: number;
  timedOut: boolean;
  failedItems: LiferayBatchFailedItem[];
  failedItemsChecked: boolean;
  verified: boolean;
  task: LiferayBatchTaskSnapshot;
};

export type LiferayBatchExportOptions = {
  className: string;
  contentType?: string;
  fieldNames?: string;
  taskItemDelegateName?: string;
  poll?: boolean;
  pollIntervalSeconds?: number;
  pollTimeoutSeconds?: number;
};

export type LiferayBatchExportResult = {
  operation: 'export';
  className: string;
  contentType: string;
  taskId: number;
  executeStatus: string;
  errorMessage?: string;
  polled: boolean;
  pollAttempts: number;
  elapsedMs: number;
  timedOut: boolean;
  contentPath?: string;
  task: LiferayBatchTaskSnapshot;
};

export type LiferayBatchStatusOptions = {
  taskId: number;
  operation?: 'import' | 'export';
};

export type LiferayBatchStatusResult = {
  operation: 'import' | 'export';
  taskId: number;
  executeStatus: string;
  errorMessage?: string;
  failedItems: LiferayBatchFailedItem[];
  failedItemsChecked: boolean;
  contentPath?: string;
  task: LiferayBatchTaskSnapshot;
};
