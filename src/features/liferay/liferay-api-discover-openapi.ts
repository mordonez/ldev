import type {
  ApiDiscoverEndpoint,
  ApiDiscoverParameter,
  ApiDiscoverSchemaDetail,
  ApiDiscoverSchemaSummary,
} from './liferay-api-discover-types.js';

/** Query parameters that define the Liferay Headless operational contract. */
const PAGINATION_PARAMS = ['page', 'pageSize'];

const FILTER_PARAM = 'filter';

const SORT_PARAM = 'sort';

const SEARCH_PARAM = 'search';

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

export type OpenApiDocument = {
  openapi?: string;
  info?: {title?: string; version?: string};
  paths?: Record<string, unknown>;
  components?: {schemas?: Record<string, OpenApiSchemaObject>};
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

export function extractEndpoints(document: OpenApiDocument): ApiDiscoverEndpoint[] {
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

export function extractSchemaSummaries(document: OpenApiDocument): ApiDiscoverSchemaSummary[] {
  const schemas = document.components?.schemas ?? {};

  return Object.entries(schemas)
    .map(([name, schema]) => ({
      name,
      propertyCount: Object.keys(schema.properties ?? {}).length,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function extractSchemaDetail(
  document: OpenApiDocument,
  schemaName: string,
): ApiDiscoverSchemaDetail | undefined {
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
