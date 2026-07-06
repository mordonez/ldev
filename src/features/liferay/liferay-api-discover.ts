import YAML from 'yaml';

import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/http/auth.js';
import type {HttpApiClient} from '../../core/http/client.js';
import {LiferayErrors} from './errors/index.js';
import {createLiferayGateway, type LiferayGateway} from './liferay-gateway.js';

/** Query parameters that define the Liferay Headless operational contract. */
const PAGINATION_PARAMS = ['page', 'pageSize'];
const FILTER_PARAM = 'filter';
const SORT_PARAM = 'sort';
const SEARCH_PARAM = 'search';

export type ApiDiscoverDependencies = {
  gateway?: LiferayGateway;
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type ApiDiscoverOptions = {
  app?: string;
  path?: string;
  method?: string;
  schema?: string;
  example?: string;
};

export type ApiDiscoverApp = {
  name: string;
  specPaths: string[];
};

export type ApiDiscoverAppsResult = {
  mode: 'apps';
  apps: ApiDiscoverApp[];
};

export type ApiDiscoverParameter = {
  name: string;
  in: string;
  required: boolean;
  type?: string;
  description?: string;
};

export type ApiDiscoverEndpoint = {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  parameters: ApiDiscoverParameter[];
  supportsPagination: boolean;
  supportsFilter: boolean;
  supportsSort: boolean;
  supportsSearch: boolean;
  requestSchema?: string;
  responseSchema?: string;
};

export type ApiDiscoverSchemaProperty = {
  name: string;
  type: string;
  required: boolean;
};

export type ApiDiscoverSchemaSummary = {
  name: string;
  propertyCount: number;
};

export type ApiDiscoverSchemaDetail = ApiDiscoverSchemaSummary & {
  properties: ApiDiscoverSchemaProperty[];
};

export type ApiDiscoverExample = {
  method: string;
  path: string;
  url: string;
  curl: string;
  javascript: string;
};

export type ApiDiscoverConventions = {
  auth: string;
  pagination: string;
  filter: string;
  sort: string;
  search: string;
  fields: string;
};

export type ApiDiscoverSpecResult = {
  mode: 'spec';
  app: string;
  specPath: string;
  baseUrl: string;
  title?: string;
  version?: string;
  endpointCount: number;
  endpoints: ApiDiscoverEndpoint[];
  schemaCount: number;
  schemas: ApiDiscoverSchemaSummary[];
  schemaDetail?: ApiDiscoverSchemaDetail;
  conventions: ApiDiscoverConventions;
  example?: ApiDiscoverExample;
};

export type ApiDiscoverResult = ApiDiscoverAppsResult | ApiDiscoverSpecResult;

type OpenApiSchemaObject = {
  type?: string;
  $ref?: string;
  description?: string;
  properties?: Record<string, OpenApiSchemaObject>;
  required?: string[];
  items?: OpenApiSchemaObject;
  format?: string;
};

type OpenApiParameterObject = {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchemaObject;
};

type OpenApiMediaTypeObject = {
  schema?: OpenApiSchemaObject;
};

type OpenApiOperationObject = {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameterObject[];
  requestBody?: {content?: Record<string, OpenApiMediaTypeObject>};
  responses?: Record<string, {content?: Record<string, OpenApiMediaTypeObject>}>;
};

type OpenApiDocument = {
  openapi?: string;
  info?: {title?: string; version?: string};
  paths?: Record<string, unknown>;
  components?: {schemas?: Record<string, OpenApiSchemaObject>};
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

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

function extractEndpoints(document: OpenApiDocument): ApiDiscoverEndpoint[] {
  const endpoints: ApiDiscoverEndpoint[] = [];
  const paths = document.paths ?? {};

  for (const [path, rawPathItem] of Object.entries(paths)) {
    if (rawPathItem === null || typeof rawPathItem !== 'object') {
      continue;
    }

    const pathItem = rawPathItem as Record<string, unknown>;
    const pathLevelParameters = Array.isArray(pathItem.parameters)
      ? (pathItem.parameters as OpenApiParameterObject[])
      : [];

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation === null || typeof operation !== 'object') {
        continue;
      }

      endpoints.push(buildEndpoint(path, method, operation as OpenApiOperationObject, pathLevelParameters));
    }
  }

  endpoints.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method));
  return endpoints;
}

function buildEndpoint(
  path: string,
  method: string,
  operation: OpenApiOperationObject,
  pathLevelParameters: OpenApiParameterObject[],
): ApiDiscoverEndpoint {
  const merged = [...pathLevelParameters, ...(operation.parameters ?? [])];
  const parameters: ApiDiscoverParameter[] = merged
    .filter((parameter) => typeof parameter.name === 'string' && parameter.name !== '')
    .map((parameter) => ({
      name: parameter.name as string,
      in: parameter.in ?? 'query',
      required: Boolean(parameter.required),
      ...(parameter.schema?.type !== undefined ? {type: parameter.schema.type} : {}),
      ...(parameter.description !== undefined ? {description: parameter.description} : {}),
    }));

  const queryNames = new Set(
    parameters.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name),
  );

  return {
    method: method.toUpperCase(),
    path,
    ...(operation.operationId !== undefined ? {operationId: operation.operationId} : {}),
    ...(operation.summary !== undefined || operation.description !== undefined
      ? {summary: operation.summary ?? operation.description}
      : {}),
    parameters,
    supportsPagination: PAGINATION_PARAMS.every((name) => queryNames.has(name)),
    supportsFilter: queryNames.has(FILTER_PARAM),
    supportsSort: queryNames.has(SORT_PARAM),
    supportsSearch: queryNames.has(SEARCH_PARAM),
    ...buildSchemaRefs(operation),
  };
}

function buildSchemaRefs(operation: OpenApiOperationObject): {requestSchema?: string; responseSchema?: string} {
  const requestSchema = refName(firstMediaTypeSchema(operation.requestBody?.content));

  let responseSchema: string | undefined;
  for (const response of Object.values(operation.responses ?? {})) {
    responseSchema = refName(firstMediaTypeSchema(response.content));
    if (responseSchema !== undefined) {
      break;
    }
  }

  return {
    ...(requestSchema !== undefined ? {requestSchema} : {}),
    ...(responseSchema !== undefined ? {responseSchema} : {}),
  };
}

function firstMediaTypeSchema(content?: Record<string, OpenApiMediaTypeObject>): OpenApiSchemaObject | undefined {
  if (content === undefined) {
    return undefined;
  }

  const values = Object.values(content);
  if (values.length === 0) {
    return undefined;
  }

  const preferred = content['application/json'] ?? values[0];
  return preferred.schema;
}

function refName(schema?: OpenApiSchemaObject): string | undefined {
  if (schema === undefined) {
    return undefined;
  }

  const ref = schema.$ref ?? schema.items?.$ref;
  if (typeof ref !== 'string') {
    return schema.type;
  }

  const name = ref.split('/').pop() ?? '';
  return name !== '' ? name : undefined;
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

function extractSchemaSummaries(document: OpenApiDocument): ApiDiscoverSchemaSummary[] {
  const schemas = document.components?.schemas ?? {};

  return Object.entries(schemas)
    .map(([name, schema]) => ({
      name,
      propertyCount: Object.keys(schema.properties ?? {}).length,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function extractSchemaDetail(document: OpenApiDocument, schemaName: string): ApiDiscoverSchemaDetail | undefined {
  const schemas = document.components?.schemas ?? {};
  const entry = Object.entries(schemas).find(([name]) => name.toLowerCase() === schemaName.toLowerCase());
  if (entry === undefined) {
    return undefined;
  }

  const [name, schema] = entry;
  const required = new Set(schema.required ?? []);
  const properties = Object.entries(schema.properties ?? {}).map(([propertyName, property]) => ({
    name: propertyName,
    type: describePropertyType(property),
    required: required.has(propertyName),
  }));

  return {name, propertyCount: properties.length, properties};
}

function describePropertyType(property: OpenApiSchemaObject): string {
  if (property.$ref !== undefined) {
    return refName(property) ?? 'object';
  }

  if (property.type === 'array') {
    const itemType = property.items !== undefined ? (refName(property.items) ?? 'object') : 'object';
    return `array<${itemType}>`;
  }

  return property.type ?? 'object';
}

function buildExample(
  endpoints: ApiDiscoverEndpoint[],
  baseUrl: string,
  options: ApiDiscoverOptions,
): ApiDiscoverExample {
  const endpoint = selectExampleEndpoint(endpoints, options);
  const query = buildExampleQuery(endpoint);
  const url = `${baseUrl}${endpoint.path}${query}`;

  const isWrite = endpoint.method !== 'GET' && endpoint.method !== 'DELETE' && endpoint.method !== 'HEAD';
  const bodyHint = endpoint.requestSchema !== undefined ? `<${endpoint.requestSchema} JSON>` : '<JSON payload>';

  const curlLines = [`curl -H "Authorization: Bearer $(ldev portal auth token --raw)" \\`];
  if (endpoint.method !== 'GET') {
    curlLines.push(`  -X ${endpoint.method} \\`);
  }
  if (isWrite) {
    curlLines.push(`  -H "Content-Type: application/json" \\`, `  -d '${bodyHint}' \\`);
  }
  curlLines.push(`  "${url}"`);

  const jsLines = [
    `const response = await fetch('${url}', {`,
    ...(endpoint.method !== 'GET' ? [`  method: '${endpoint.method}',`] : []),
    `  headers: {`,
    `    Authorization: \`Bearer \${accessToken}\`,`,
    ...(isWrite ? [`    'Content-Type': 'application/json',`] : []),
    `  },`,
    ...(isWrite ? [`  body: JSON.stringify(payload), // ${bodyHint}`] : []),
    `});`,
    `const data = await response.json();`,
  ];

  return {
    method: endpoint.method,
    path: endpoint.path,
    url,
    curl: curlLines.join('\n'),
    javascript: jsLines.join('\n'),
  };
}

function selectExampleEndpoint(endpoints: ApiDiscoverEndpoint[], options: ApiDiscoverOptions): ApiDiscoverEndpoint {
  const examplePath = options.example ?? '';
  const method = options.method?.toUpperCase();

  const byMethod = (candidates: ApiDiscoverEndpoint[]): ApiDiscoverEndpoint | undefined => {
    if (method !== undefined) {
      return candidates.find((endpoint) => endpoint.method === method);
    }

    return candidates.find((endpoint) => endpoint.method === 'GET') ?? candidates[0];
  };

  const exactMatches = endpoints.filter((endpoint) => endpoint.path === examplePath);
  const exact = byMethod(exactMatches);
  if (exact !== undefined) {
    return exact;
  }

  const needle = examplePath.toLowerCase();
  const partialMatches = endpoints.filter((endpoint) => endpoint.path.toLowerCase().includes(needle));
  const partial = byMethod(partialMatches);
  if (partial !== undefined) {
    return partial;
  }

  throw LiferayErrors.apiDiscoverError(
    `No endpoint matches --example '${examplePath}'${method !== undefined ? ` with method ${method}` : ''}. ` +
      'Use the endpoint list to pick a valid path.',
  );
}

function buildExampleQuery(endpoint: ApiDiscoverEndpoint): string {
  if (endpoint.method !== 'GET' || !endpoint.supportsPagination) {
    return '';
  }

  return '?page=1&pageSize=20';
}

export function formatLiferayApiDiscover(result: ApiDiscoverResult): string {
  if (result.mode === 'apps') {
    return formatAppsResult(result);
  }

  return formatSpecResult(result);
}

function formatAppsResult(result: ApiDiscoverAppsResult): string {
  if (result.apps.length === 0) {
    return 'No Headless apps discovered at /o/openapi';
  }

  const lines = ['Headless apps (from /o/openapi):', ''];
  for (const app of result.apps) {
    const jsonSpec = app.specPaths.find((specPath) => specPath.endsWith('.json')) ?? app.specPaths[0];
    lines.push(`- ${app.name}  spec=${jsonSpec}`);
  }

  lines.push('', `total=${result.apps.length}`, '', 'Next: ldev portal api discover <app-name>');
  return lines.join('\n');
}

function formatSpecResult(result: ApiDiscoverSpecResult): string {
  const lines: string[] = [];

  lines.push(`${result.title ?? result.app} ${result.version ?? ''}`.trim());
  lines.push(`app=${result.app} spec=${result.specPath}`);
  lines.push(`baseUrl=${result.baseUrl}`);
  lines.push('');

  lines.push(`Endpoints (${result.endpointCount}):`);
  for (const endpoint of result.endpoints) {
    lines.push(`  ${endpoint.method.padEnd(6)} ${endpoint.path}${formatEndpointCapabilities(endpoint)}`);
  }

  if (result.schemaDetail !== undefined) {
    lines.push('', `Schema ${result.schemaDetail.name} (${result.schemaDetail.propertyCount} properties):`);
    for (const property of result.schemaDetail.properties) {
      lines.push(`  - ${property.name}: ${property.type}${property.required ? ' (required)' : ''}`);
    }
  } else {
    lines.push('', `Schemas (${result.schemaCount}):`);
    for (const schema of result.schemas) {
      lines.push(`  - ${schema.name} (${schema.propertyCount} properties)`);
    }
    lines.push('', 'Tip: --schema <name> shows full property details for one schema.');
  }

  lines.push('', 'Conventions:');
  lines.push(`  auth:       ${result.conventions.auth}`);
  lines.push(`  pagination: ${result.conventions.pagination}`);
  lines.push(`  filter:     ${result.conventions.filter}`);
  lines.push(`  sort:       ${result.conventions.sort}`);
  lines.push(`  search:     ${result.conventions.search}`);
  lines.push(`  fields:     ${result.conventions.fields}`);

  if (result.example !== undefined) {
    lines.push('', `Example (${result.example.method} ${result.example.path}):`);
    lines.push('', 'curl:');
    lines.push(indentBlock(result.example.curl));
    lines.push('', 'javascript:');
    lines.push(indentBlock(result.example.javascript));
  }

  return lines.join('\n');
}

function formatEndpointCapabilities(endpoint: ApiDiscoverEndpoint): string {
  const capabilities: string[] = [];
  if (endpoint.supportsPagination) {
    capabilities.push('page');
  }
  if (endpoint.supportsFilter) {
    capabilities.push('filter');
  }
  if (endpoint.supportsSort) {
    capabilities.push('sort');
  }
  if (endpoint.supportsSearch) {
    capabilities.push('search');
  }

  return capabilities.length > 0 ? `  [${capabilities.join(',')}]` : '';
}

function indentBlock(block: string): string {
  return block
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
