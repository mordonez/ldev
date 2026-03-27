import type {AppConfig} from '../../core/config/load-config.js';

import {queryReindexTasks} from './reindex-shared.js';

export type ReindexTasksResult = {
  ok: true;
  output: string;
};

export async function runReindexTasks(config: AppConfig): Promise<ReindexTasksResult> {
  return {
    ok: true,
    output: await queryReindexTasks(config, process.env),
  };
}

export function formatReindexTasks(result: ReindexTasksResult): string {
  return result.output === '' ? 'Sin tareas de reindex activas o pendientes.' : result.output;
}
