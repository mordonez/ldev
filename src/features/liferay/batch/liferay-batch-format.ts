/**
 * Text formatting and exit-code helpers for the Batch Engine wrapper commands.
 */

import type {
  LiferayBatchExportResult,
  LiferayBatchFailedItem,
  LiferayBatchImportResult,
  LiferayBatchStatusResult,
} from './liferay-batch-types.js';

export function getLiferayBatchImportExitCode(result: LiferayBatchImportResult): number {
  if (!result.polled) {
    return 0;
  }

  if (result.timedOut || result.executeStatus !== 'COMPLETED' || result.failedItems.length > 0) {
    return 1;
  }

  return 0;
}

export function formatLiferayBatchImport(result: LiferayBatchImportResult): string {
  const lines = [
    `${result.timedOut ? 'TIMEOUT' : result.executeStatus}\timport\t${result.className}\ttask=${result.taskId}`,
    `items: submitted=${result.submittedItems} failed=${result.failedItemsChecked ? result.failedItems.length : 'unknown'}`,
  ];

  if (result.polled) {
    lines.push(`poll: attempts=${result.pollAttempts} elapsed=${result.elapsedMs}ms`);
  } else {
    lines.push('poll: skipped (--no-poll); task continues server-side');
  }

  if (result.errorMessage) {
    lines.push(`error: ${result.errorMessage}`);
  }

  lines.push(...formatFailedItems(result.failedItems, result.failedItemsChecked, result.polled));

  if (result.verified) {
    lines.push(`verified: read-back executeStatus=COMPLETED with 0 failed items`);
  } else if (result.timedOut) {
    lines.push(
      `hint: polling timed out with executeStatus=${result.executeStatus}; ` +
        `re-check with: ldev portal batch status --task ${result.taskId}`,
    );
  } else if (!result.polled) {
    lines.push(`hint: check progress with: ldev portal batch status --task ${result.taskId}`);
  }

  return lines.join('\n');
}

export function getLiferayBatchExportExitCode(result: LiferayBatchExportResult): number {
  if (!result.polled) {
    return 0;
  }

  return result.timedOut || result.executeStatus !== 'COMPLETED' ? 1 : 0;
}

export function formatLiferayBatchExport(result: LiferayBatchExportResult): string {
  const lines = [
    `${result.timedOut ? 'TIMEOUT' : result.executeStatus}\texport\t${result.className}\t` +
      `contentType=${result.contentType}\ttask=${result.taskId}`,
  ];

  if (result.polled) {
    lines.push(`poll: attempts=${result.pollAttempts} elapsed=${result.elapsedMs}ms`);
  } else {
    lines.push('poll: skipped (use --poll to wait for completion)');
  }

  if (result.errorMessage) {
    lines.push(`error: ${result.errorMessage}`);
  }

  if (result.contentPath) {
    lines.push(`content: GET ${result.contentPath} (authenticated) downloads the exported archive`);
  } else if (result.timedOut) {
    lines.push(
      `hint: polling timed out with executeStatus=${result.executeStatus}; ` +
        `re-check with: ldev portal batch status --task ${result.taskId} --operation export`,
    );
  } else if (!result.polled) {
    lines.push(`hint: check progress with: ldev portal batch status --task ${result.taskId} --operation export`);
  }

  return lines.join('\n');
}

export function getLiferayBatchStatusExitCode(result: LiferayBatchStatusResult): number {
  return result.executeStatus === 'FAILED' || result.failedItems.length > 0 ? 1 : 0;
}

export function formatLiferayBatchStatus(result: LiferayBatchStatusResult): string {
  const lines = [`${result.executeStatus}\t${result.operation}\ttask=${result.taskId}`];

  if (result.errorMessage) {
    lines.push(`error: ${result.errorMessage}`);
  }

  if (result.operation === 'import') {
    lines.push(...formatFailedItems(result.failedItems, result.failedItemsChecked, true));
  }

  if (result.contentPath) {
    lines.push(`content: GET ${result.contentPath} (authenticated) downloads the exported archive`);
  }

  return lines.join('\n');
}

function formatFailedItems(items: LiferayBatchFailedItem[], checked: boolean, polled: boolean): string[] {
  if (!checked) {
    return polled ? ['failed items: not checked (endpoint unavailable or task not terminal)'] : [];
  }

  if (items.length === 0) {
    return [];
  }

  const lines = [`failed items (${items.length}):`];
  for (const item of items) {
    const index = item.itemIndex !== undefined ? `#${item.itemIndex} ` : '';
    const message = item.message ?? 'no message';
    const excerpt = item.item !== undefined ? ` item=${truncate(item.item, 200)}` : '';
    lines.push(`  ${index}${message}${excerpt}`);
  }

  return lines;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}
