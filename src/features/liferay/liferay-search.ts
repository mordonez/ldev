import type {AppConfig} from '../../core/config/load-config.js';
import {parseJsonUnknown} from '../../core/utils/json.js';
import {requestElasticsearchJson, resolveEsUrl} from '../reindex/reindex-shared.js';

export type LiferaySearchIndicesResult = {
  ok: true;
  esUrl: string;
  rows: Array<Record<string, unknown>>;
};

export type LiferaySearchMappingsResult = {
  ok: true;
  esUrl: string;
  index: string;
  mappings: Record<string, unknown>;
};

export type LiferaySearchQueryResult = {
  ok: true;
  esUrl: string;
  index: string;
  hits: Record<string, unknown>;
};

export async function runLiferaySearchIndices(config: AppConfig): Promise<LiferaySearchIndicesResult> {
  const esUrl = resolveEsUrl(config);

  return {
    ok: true,
    esUrl,
    rows: (await requestElasticsearchJson(config, '/_cat/indices?format=json', {
      errorCode: 'LIFERAY_SEARCH_ERROR',
      errorContext: 'listar indices',
    })) as Array<Record<string, unknown>>,
  };
}

export async function runLiferaySearchMappings(
  config: AppConfig,
  options: {index: string},
): Promise<LiferaySearchMappingsResult> {
  const esUrl = resolveEsUrl(config);

  return {
    ok: true,
    esUrl,
    index: options.index,
    mappings: (await requestElasticsearchJson(config, `/${encodeURIComponent(options.index)}/_mapping`, {
      errorCode: 'LIFERAY_SEARCH_ERROR',
      errorContext: `consultar mappings para ${options.index}`,
    })) as Record<string, unknown>,
  };
}

export async function runLiferaySearchQuery(
  config: AppConfig,
  options: {index: string; query?: string; body?: string},
): Promise<LiferaySearchQueryResult> {
  const esUrl = resolveEsUrl(config);
  const rawBody = options.body?.trim();
  const payload: unknown = rawBody
    ? parseJsonUnknown(rawBody)
    : {
        query: {
          query_string: {
            query: options.query?.trim() || '*',
          },
        },
      };

  return {
    ok: true,
    esUrl,
    index: options.index,
    hits: (await requestElasticsearchJson(config, `/${encodeURIComponent(options.index)}/_search`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(payload),
      errorCode: 'LIFERAY_SEARCH_ERROR',
      errorContext: `ejecutar query en ${options.index}`,
    })) as Record<string, unknown>,
  };
}

export function formatLiferaySearchIndices(result: LiferaySearchIndicesResult): string {
  return result.rows
    .map(
      (row) =>
        `${typeof row.health === 'string' ? row.health : '?'} ${typeof row.status === 'string' ? row.status : '?'} ${typeof row.index === 'string' ? row.index : '?'} ${typeof row['docs.count'] === 'string' ? row['docs.count'] : '?'}`,
    )
    .join('\n');
}

export function formatLiferaySearchMappings(result: LiferaySearchMappingsResult): string {
  return JSON.stringify(result.mappings, null, 2);
}

export function formatLiferaySearchQuery(result: LiferaySearchQueryResult): string {
  const hits = (result.hits.hits as {total?: {value?: number}} | undefined)?.total?.value;
  return `index=${result.index} hits=${hits ?? 'unknown'}`;
}
