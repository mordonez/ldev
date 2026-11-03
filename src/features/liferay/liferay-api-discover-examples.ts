import {LiferayErrors} from './errors/index.js';
import type {ApiDiscoverEndpoint, ApiDiscoverExample, ApiDiscoverOptions} from './liferay-api-discover-types.js';

export function buildExample(
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
