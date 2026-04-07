import type {AppConfig} from '../../core/config/load-config.js';

import {fetchReindexRows, type ReindexIndexRow, resolveEsUrl} from './reindex-shared.js';

export type ReindexStatusResult = {
  ok: true;
  esUrl: string;
  rows: ReindexIndexRow[];
};

export async function runReindexStatus(config: AppConfig): Promise<ReindexStatusResult> {
  return {
    ok: true,
    esUrl: resolveEsUrl(config),
    rows: await fetchReindexRows(config),
  };
}

export function formatReindexStatus(result: ReindexStatusResult): string {
  if (result.rows.length === 0) {
    return `Sin indices journal/liferay visibles en ${result.esUrl}`;
  }

  return result.rows.map((row) => `${row.health} ${row.status} ${row.index} ${row.docsCount}`).join('\n');
}
