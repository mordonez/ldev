import YAML from 'yaml';

import type {AppConfig} from '../../core/config/load-config.js';
import {LiferayErrors} from './errors/index.js';
import {createLiferayGateway, type LiferayGateway} from './liferay-gateway.js';
import {
  extractEndpoints,
  extractSchemaDetail,
  extractSchemaSummaries,
  type OpenApiDocument,
} from './liferay-api-discover-openapi.js';
import {buildExample} from './liferay-api-discover-examples.js';
import type {
  ApiDiscoverApp,
  ApiDiscoverConventions,
  ApiDiscoverDependencies,
  ApiDiscoverEndpoint,
  ApiDiscoverOptions,
  ApiDiscoverResult,
  ApiDiscoverSpecResult,
} from './liferay-api-discover-types.js';

export const API_DISCOVER_CONVENTIONS: ApiDiscoverConventions = {
  auth: "Send 'Authorization: Bearer <token>'. Fetch a token with: ldev portal auth token --raw",
  pagination:
    'List endpoints accept page (1-based) and pageSize. Responses wrap results as {items, page, pageSize, totalCount, lastPage}; iterate while page <= lastPage.',
  filter: "OData-style, e.g. filter=title eq 'News', filter=contains(title,'news'), filter=creatorId eq 20123",
  sort: 'Comma-separated field:direction pairs, e.g. sort=title:asc,dateCreated:desc',
  search: 'Keyword search across searchable fields, e.g. search=welcome',
  fields: 'Restrict returned fields with fields=id,title; expand related entities with nestedFields=<name>',
};

export async function runLiferayApiDiscover(
  config: AppConfig,
  options?: ApiDiscoverOptions,
  dependencies?: ApiDiscoverDependencies,
): Promise<ApiDiscoverResult> {
  const gateway = resolveGateway(config, dependencies);
  const appName = normalizeAppName(options?.app ?? '');

  if (appName === '') {
    const apps = await listOpenApiApps(gateway);
    return {mode: 'apps', apps};
  }

  const {specPath, document} = await resolveOpenApiSpec(gateway, appName);
  return buildSpecResult(config, appName, specPath, document, options ?? {});
}

function resolveGateway(config: AppConfig, dependencies?: ApiDiscoverDependencies): LiferayGateway {
  if (dependencies?.gateway) {
    return dependencies.gateway;
  }

  return createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
}

export function normalizeAppName(app: string): string {
  return app
    .trim()
    .replace(/^\/?o\//, '')
    .replace(/^\/+|\/+$/g, '');
}

/**
 * List available Headless apps from the /o/openapi catalog.
 * The catalog maps app names to arrays of spec URLs (json + yaml).
 */
export async function listOpenApiApps(gateway: LiferayGateway): Promise<ApiDiscoverApp[]> {
  const response = await gateway.getRaw<Record<string, unknown>>('/o/openapi');

  if (!response.ok) {
    throw LiferayErrors.apiDiscoverError(
      `Could not list Headless apps: GET /o/openapi failed with status=${response.status}. ` +
        'Check portal availability and OAuth2 scopes.',
    );
  }

  const catalog = parseCatalog(response.data);
  if (catalog === null) {
    throw LiferayErrors.apiDiscoverError('GET /o/openapi returned an unexpected payload; cannot list Headless apps.');
  }

  return catalog;
}

function parseCatalog(data: unknown): ApiDiscoverApp[] | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const apps: ApiDiscoverApp[] = [];
  for (const [name, value] of Object.entries(data as Record<string, unknown>)) {
    const rawEntries = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const specPaths = rawEntries
      .filter((entry): entry is string => typeof entry === 'string')
      .map(toSpecPath)
      .filter((entry) => entry !== '');

    if (specPaths.length > 0) {
      apps.push({name, specPaths});
    }
  }

  apps.sort((left, right) => left.name.localeCompare(right.name));
  return apps.length > 0 ? apps : null;
}

function toSpecPath(specUrl: string): string {
  const trimmed = specUrl.trim();
  if (trimmed === '') {
    return '';
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    return new URL(trimmed).pathname;
  } catch {
    return '';
  }
}

async function tryListOpenApiApps(gateway: LiferayGateway): Promise<ApiDiscoverApp[] | null> {
  try {
    return await listOpenApiApps(gateway);
  } catch {
    return null;
  }
}

async function resolveOpenApiSpec(
  gateway: LiferayGateway,
  appName: string,
): Promise<{specPath: string; document: OpenApiDocument}> {
  const catalog = await tryListOpenApiApps(gateway);

  const candidates = buildSpecCandidates(appName, catalog);

  for (const candidate of candidates) {
    const response = await gateway.getRaw<unknown>(candidate);
    if (!response.ok) {
      continue;
    }

    const document = parseSpecBody(response.data, response.body);
    if (document !== null) {
      return {specPath: candidate, document};
    }
  }

  const availableApps = catalog?.map((app) => app.name) ?? [];
  const hint =
    availableApps.length > 0
      ? ` Available apps: ${availableApps.join(', ')}`
      : ' Run without an app name to list available apps.';

  throw LiferayErrors.apiDiscoverError(`Could not resolve an OpenAPI spec for app '${appName}'.${hint}`);
}

function buildSpecCandidates(appName: string, catalog: ApiDiscoverApp[] | null): string[] {
  const candidates: string[] = [];

  const catalogEntry = catalog?.find((app) => app.name.toLowerCase() === appName.toLowerCase());
  if (catalogEntry) {
    // Prefer JSON specs; the HTTP client parses JSON natively.
    const jsonFirst = [...catalogEntry.specPaths].sort((left, right) => scoreSpecPath(right) - scoreSpecPath(left));
    candidates.push(...jsonFirst);
  }

  for (const pattern of [
    `/o/${appName}/v1.0/openapi.json`,
    `/o/${appName}/v2.0/openapi.json`,
    `/o/${appName}/openapi.json`,
    `/o/${appName}/v1.0/openapi.yaml`,
  ]) {
    if (!candidates.includes(pattern)) {
      candidates.push(pattern);
    }
  }

  return candidates;
}

function scoreSpecPath(specPath: string): number {
  return specPath.endsWith('.json') ? 1 : 0;
}

function parseSpecBody(data: unknown, body: string): OpenApiDocument | null {
  const candidate = data ?? parseYamlSafely(body);

  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const document = candidate as OpenApiDocument;
  if (document.paths === undefined && document.openapi === undefined) {
    return null;
  }

  return document;
}

function parseYamlSafely(body: string): unknown {
  if (body.trim() === '') {
    return null;
  }

  try {
    return YAML.parse(body);
  } catch {
    return null;
  }
}

function buildSpecResult(
  config: AppConfig,
  appName: string,
  specPath: string,
  document: OpenApiDocument,
  options: ApiDiscoverOptions,
): ApiDiscoverSpecResult {
  const allEndpoints = extractEndpoints(document);
  const basePath = resolveSpecBasePath(specPath, allEndpoints);
  const baseUrl = `${config.liferay.url.replace(/\/+$/, '')}${basePath}`;

  const endpoints = filterEndpoints(allEndpoints, options);
  const schemas = extractSchemaSummaries(document);
  const schemaDetail = options.schema ? extractSchemaDetail(document, options.schema) : undefined;

  if (options.schema && schemaDetail === undefined) {
    const available = schemas.map((schema) => schema.name);
    throw LiferayErrors.apiDiscoverError(
      `Schema '${options.schema}' not found in ${specPath}.` +
        (available.length > 0 ? ` Available schemas: ${available.join(', ')}` : ''),
    );
  }

  const example = options.example ? buildExample(allEndpoints, baseUrl, options) : undefined;

  return {
    mode: 'spec',
    app: appName,
    specPath,
    baseUrl,
    title: document.info?.title,
    version: document.info?.version,
    endpointCount: endpoints.length,
    endpoints,
    schemaCount: schemas.length,
    schemas,
    ...(schemaDetail !== undefined ? {schemaDetail} : {}),
    conventions: API_DISCOVER_CONVENTIONS,
    ...(example !== undefined ? {example} : {}),
  };
}

/**
 * Resolve the base path to prepend to every endpoint path.
 *
 * Most OpenAPI specs declare endpoint paths relative to the spec's own location
 * (e.g. spec at /o/headless-delivery/v1.0/openapi.json, path /structured-contents),
 * so the version segment from the spec path belongs in the base path.
 *
 * Some Liferay-generated specs instead bake the version segment into every path
 * itself (e.g. spec at /o/headless-delivery/v1.0/openapi.json, path
 * /v1.0/structured-contents). Prefixing the version-included base path in that
 * case would duplicate the version segment in every generated URL, so the base
 * path is trimmed to the app root instead.
 */
function resolveSpecBasePath(specPath: string, endpoints: ApiDiscoverEndpoint[]): string {
  const basePathWithVersion = specPath.replace(/\/openapi\.(json|yaml)$/i, '');
  const versionMatch = /^(.*)(\/v[\d.]+)$/i.exec(basePathWithVersion);

  if (versionMatch === null) {
    return basePathWithVersion;
  }

  const [, appRoot, versionSegment] = versionMatch;
  const pathsEmbedVersion = endpoints.some(
    (endpoint) => endpoint.path === versionSegment || endpoint.path.startsWith(`${versionSegment}/`),
  );

  return pathsEmbedVersion ? appRoot : basePathWithVersion;
}

function filterEndpoints(endpoints: ApiDiscoverEndpoint[], options: ApiDiscoverOptions): ApiDiscoverEndpoint[] {
  let filtered = endpoints;

  if (options.path) {
    const needle = options.path.toLowerCase();
    filtered = filtered.filter((endpoint) => endpoint.path.toLowerCase().includes(needle));
  }

  if (options.method) {
    const method = options.method.toUpperCase();
    filtered = filtered.filter((endpoint) => endpoint.method === method);
  }

  return filtered;
}
