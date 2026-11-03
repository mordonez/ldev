import type {
  ApiDiscoverAppsResult,
  ApiDiscoverEndpoint,
  ApiDiscoverResult,
  ApiDiscoverSpecResult,
} from './liferay-api-discover-types.js';

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
