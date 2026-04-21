import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerCompose} from '../../core/platform/docker.js';
import {formatProcessError} from '../../core/platform/process.js';
import {resolveEnvContext} from '../../core/runtime/env-context.js';

export type ReindexIndexRow = {
  health: string;
  status: string;
  index: string;
  docsCount: string;
};

type ElasticsearchTarget = {
  mode: 'external' | 'sidecar';
  esUrl: string;
};

export function resolveEsUrl(config: AppConfig): string {
  return resolveElasticsearchTarget(config).esUrl;
}

export function resolveElasticsearchTarget(config: AppConfig): ElasticsearchTarget {
  const context = resolveEnvContext(config);
  const composeFile = context.envValues.COMPOSE_FILE || '';
  const hasExternalElasticsearch = composeFile
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .includes('docker-compose.elasticsearch.yml');

  if (!hasExternalElasticsearch) {
    return {
      mode: 'sidecar',
      esUrl: 'http://127.0.0.1:9201 (inside liferay)',
    };
  }

  const bindIp = context.envValues.BIND_IP || 'localhost';
  const esPort = context.envValues.ES_HTTP_PORT || '9200';
  return {
    mode: 'external',
    esUrl: `http://${bindIp}:${esPort}`,
  };
}

export async function fetchReindexRows(config: AppConfig): Promise<ReindexIndexRow[]> {
  const rows = (await requestElasticsearchJson(config, '/_cat/indices?format=json&h=health,status,index,docs.count', {
    errorCode: 'REINDEX_ES_REQUEST_FAILED',
    errorContext: 'consultar indices',
  })) as Array<Record<string, unknown>>;
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
  await requestElasticsearchJson(config, '/_all/_settings', {
    method: 'PUT',
    body: JSON.stringify({index: {refresh_interval: refreshInterval}}),
    headers: {'content-type': 'application/json'},
    errorCode: 'REINDEX_ES_SETTINGS_FAILED',
    errorContext: 'actualizar refresh_interval',
  });
}

export async function refreshIndices(config: AppConfig): Promise<void> {
  await requestElasticsearchJson(config, '/_refresh', {
    method: 'POST',
    errorCode: 'REINDEX_ES_REFRESH_FAILED',
    errorContext: 'hacer refresh',
  });
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
    throw new CliError(formatProcessError(result, 'No se pudieron consultar tareas de reindex.'), {
      code: 'REINDEX_TASKS_FAILED',
    });
  }

  return result.stdout.trim();
}

export async function requestElasticsearchJson(
  config: AppConfig,
  requestPath: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: string;
    headers?: Record<string, string>;
    errorCode: string;
    errorContext: string;
  },
): Promise<unknown> {
  const result = await requestElasticsearch(config, requestPath, options);
  return JSON.parse(result.body);
}

async function requestElasticsearch(
  config: AppConfig,
  requestPath: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: string;
    headers?: Record<string, string>;
    errorCode: string;
    errorContext: string;
  },
): Promise<{esUrl: string; status: number; body: string}> {
  const target = resolveElasticsearchTarget(config);

  try {
    if (target.mode === 'external') {
      const response = await fetch(`${target.esUrl}${requestPath}`, {
        method: options?.method ?? 'GET',
        headers: options?.headers,
        body: options?.body,
      });

      const body = await response.text();

      if (!response.ok) {
        throw new CliError(
          `Elasticsearch responded ${response.status} to ${options?.errorContext} at ${target.esUrl}`,
          {
            code: options?.errorCode ?? 'REINDEX_ES_REQUEST_FAILED',
          },
        );
      }

      return {
        esUrl: target.esUrl,
        status: response.status,
        body,
      };
    }

    const context = resolveEnvContext(config);
    const args = [
      'exec',
      '-T',
      'liferay',
      'curl',
      '-sS',
      '-o',
      '-',
      '-w',
      '\n__LDEV_STATUS__%{http_code}',
      '-X',
      options?.method ?? 'GET',
    ];

    for (const [header, value] of Object.entries(options?.headers ?? {})) {
      args.push('-H', `${header}: ${value}`);
    }

    if (options?.body !== undefined) {
      args.push('--data-binary', '@-');
    }

    args.push(`http://127.0.0.1:9201${requestPath}`);

    const result = await runDockerCompose(context.dockerDir, args, {
      input: options?.body,
      reject: false,
    });

    if (!result.ok) {
      throw new CliError(
        result.stderr.trim() || `Could not connect to the Elasticsearch sidecar inside the liferay container.`,
        {code: options?.errorCode ?? 'REINDEX_ES_REQUEST_FAILED'},
      );
    }

    const marker = '\n__LDEV_STATUS__';
    const markerIndex = result.stdout.lastIndexOf(marker);
    if (markerIndex === -1) {
      throw new CliError(`Could not parse the Elasticsearch response from ${target.esUrl}`, {
        code: options?.errorCode ?? 'REINDEX_ES_REQUEST_FAILED',
      });
    }

    const body = result.stdout.slice(0, markerIndex);
    const status = Number(result.stdout.slice(markerIndex + marker.length).trim());

    if (!Number.isFinite(status) || status < 200 || status >= 300) {
      throw new CliError(`Elasticsearch responded ${status} to ${options?.errorContext} at ${target.esUrl}`, {
        code: options?.errorCode ?? 'REINDEX_ES_REQUEST_FAILED',
      });
    }

    return {
      esUrl: target.esUrl,
      status,
      body,
    };
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError(
      `Could not connect to Elasticsearch at ${target.esUrl}. If using the default sidecar, ensure the liferay container is running; if using an external overlay, check BIND_IP/ES_HTTP_PORT.`,
      {code: options?.errorCode ?? 'REINDEX_ES_REQUEST_FAILED'},
    );
  }
}
