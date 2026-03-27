import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerCompose} from '../../core/platform/docker.js';
import {resolveEnvContext} from '../env/env-files.js';

export type ReindexIndexRow = {
  health: string;
  status: string;
  index: string;
  docsCount: string;
};

export function resolveEsUrl(config: AppConfig): string {
  const context = resolveEnvContext(config);
  const bindIp = context.envValues.BIND_IP || 'localhost';
  const esPort = context.envValues.ES_HTTP_PORT || '9200';
  return `http://${bindIp}:${esPort}`;
}

export async function fetchReindexRows(config: AppConfig): Promise<ReindexIndexRow[]> {
  const esUrl = resolveEsUrl(config);
  const response = await fetch(`${esUrl}/_cat/indices?format=json&h=health,status,index,docs.count`);
  if (!response.ok) {
    throw new CliError(`Elasticsearch respondio ${response.status} al consultar indices en ${esUrl}`, {
      code: 'REINDEX_ES_REQUEST_FAILED',
    });
  }

  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows
    .map((row) => ({
      health: String(row.health ?? ''),
      status: String(row.status ?? ''),
      index: String(row.index ?? ''),
      docsCount: String(row['docs.count'] ?? ''),
    }))
    .filter((row) => /journal|liferay/i.test(row.index));
}

export async function updateRefreshInterval(config: AppConfig, refreshInterval: '-1' | '1s'): Promise<void> {
  const esUrl = resolveEsUrl(config);
  const response = await fetch(`${esUrl}/_all/_settings`, {
    method: 'PUT',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({index: {refresh_interval: refreshInterval}}),
  });

  if (!response.ok) {
    throw new CliError(`Elasticsearch respondio ${response.status} al actualizar refresh_interval en ${esUrl}`, {
      code: 'REINDEX_ES_SETTINGS_FAILED',
    });
  }
}

export async function refreshIndices(config: AppConfig): Promise<void> {
  const esUrl = resolveEsUrl(config);
  const response = await fetch(`${esUrl}/_refresh`, {method: 'POST'});
  if (!response.ok) {
    throw new CliError(`Elasticsearch respondio ${response.status} al hacer refresh en ${esUrl}`, {
      code: 'REINDEX_ES_REFRESH_FAILED',
    });
  }
}

export async function queryReindexTasks(config: AppConfig, processEnv?: NodeJS.ProcessEnv): Promise<string> {
  const context = resolveEnvContext(config);
  const postgresUser = context.envValues.POSTGRES_USER || 'liferay';
  const postgresDb = context.envValues.POSTGRES_DB || 'liferay';
  const result = await runDockerCompose(
    context.dockerDir,
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      postgresUser,
      '-d',
      postgresDb,
      '-x',
      '-c',
      `SELECT backgroundtaskid,
              CASE status WHEN 0 THEN 'PENDING' WHEN 1 THEN 'RUNNING' WHEN 2 THEN 'SUCCESSFUL' WHEN 3 THEN 'FAILED' ELSE status::text END AS status,
              createdate,
              completiondate,
              taskexecutorclassname
         FROM backgroundtask
        WHERE taskexecutorclassname LIKE '%Reindex%'
          AND status IN (0, 1)
        ORDER BY createdate DESC
        LIMIT 20;`,
    ],
    {env: processEnv, reject: false},
  );

  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || 'No se pudieron consultar tareas de reindex.', {
      code: 'REINDEX_TASKS_FAILED',
    });
  }

  return result.stdout.trim();
}
