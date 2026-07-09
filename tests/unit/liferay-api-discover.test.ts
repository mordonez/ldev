import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {isCliError} from '../../src/core/errors.js';
import {
  formatLiferayApiDiscover,
  runLiferayApiDiscover,
  type ApiDiscoverAppsResult,
  type ApiDiscoverSpecResult,
} from '../../src/features/liferay/liferay-api-discover.js';
import {
  createStaticTokenClient,
  createTestFetchImpl,
  createTestJsonResponse,
} from '../../src/testing/cli-test-helpers.js';

const CONFIG = {
  cwd: '/tmp/repo',
  repoRoot: '/tmp/repo',
  dockerDir: '/tmp/repo/docker',
  liferayDir: '/tmp/repo/liferay',
  files: {
    dockerEnv: '/tmp/repo/docker/.env',
    liferayProfile: '/tmp/repo/.liferay-cli.yml',
  },
  liferay: {
    url: 'http://localhost:8080',
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'client-secret',
    scopeAliases: 'scope-a',
    timeoutSeconds: 30,
  },
};

const TOKEN_CLIENT = createStaticTokenClient();

const OPENAPI_CATALOG = {
  'headless-delivery': ['http://localhost:8080/o/headless-delivery/v1.0/openapi.json'],
  'headless-admin-user': ['http://localhost:8080/o/headless-admin-user/v1.0/openapi.json'],
};

const HEADLESS_DELIVERY_SPEC = {
  openapi: '3.0.1',
  info: {title: 'Headless Delivery', version: 'v1.0'},
  paths: {
    '/sites/{siteId}/structured-contents': {
      get: {
        operationId: 'getSiteStructuredContentsPage',
        summary: 'Retrieve structured contents for a site',
        parameters: [
          {name: 'siteId', in: 'path', required: true, schema: {type: 'integer'}},
          {name: 'page', in: 'query', required: false, schema: {type: 'integer'}},
          {name: 'pageSize', in: 'query', required: false, schema: {type: 'integer'}},
          {name: 'filter', in: 'query', required: false, schema: {type: 'string'}},
          {name: 'sort', in: 'query', required: false, schema: {type: 'string'}},
          {name: 'search', in: 'query', required: false, schema: {type: 'string'}},
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {type: 'array', items: {$ref: '#/components/schemas/StructuredContent'}},
              },
            },
          },
        },
      },
      post: {
        operationId: 'postSiteStructuredContent',
        summary: 'Create a structured content',
        parameters: [{name: 'siteId', in: 'path', required: true, schema: {type: 'integer'}}],
        requestBody: {
          content: {
            'application/json': {schema: {$ref: '#/components/schemas/StructuredContent'}},
          },
        },
        responses: {
          '200': {
            content: {
              'application/json': {schema: {$ref: '#/components/schemas/StructuredContent'}},
            },
          },
        },
      },
    },
    '/structured-contents/{structuredContentId}': {
      delete: {
        operationId: 'deleteStructuredContent',
        parameters: [{name: 'structuredContentId', in: 'path', required: true, schema: {type: 'integer'}}],
        responses: {'204': {}},
      },
    },
  },
  components: {
    schemas: {
      StructuredContent: {
        type: 'object',
        required: ['title'],
        properties: {
          id: {type: 'integer'},
          title: {type: 'string'},
          contentFields: {type: 'array', items: {type: 'object'}},
        },
      },
      ContentField: {
        type: 'object',
        properties: {
          name: {type: 'string'},
        },
      },
    },
  },
};

function createDiscoverFetchImpl() {
  return createTestFetchImpl((url) => {
    if (url.includes('/o/openapi')) {
      return createTestJsonResponse(OPENAPI_CATALOG);
    }

    if (url.includes('/o/headless-delivery/v1.0/openapi.json')) {
      return createTestJsonResponse(HEADLESS_DELIVERY_SPEC);
    }

    return new Response('not found', {status: 404});
  });
}

describe('liferay portal api discover', () => {
  test('lists available Headless apps when no app name is given', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverAppsResult;

    expect(result.mode).toBe('apps');
    expect(result.apps.map((app) => app.name)).toEqual(['headless-admin-user', 'headless-delivery']);
    expect(formatLiferayApiDiscover(result)).toContain('headless-delivery');
    expect(formatLiferayApiDiscover(result)).toContain('ldev portal api discover <app-name>');
  });

  test('resolves the spec and lists endpoints with capability tags', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: 'headless-delivery'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.mode).toBe('spec');
    expect(result.app).toBe('headless-delivery');
    expect(result.specPath).toBe('/o/headless-delivery/v1.0/openapi.json');
    expect(result.baseUrl).toBe('http://localhost:8080/o/headless-delivery/v1.0');
    expect(result.endpointCount).toBe(3);

    const getEndpoint = result.endpoints.find(
      (endpoint) => endpoint.method === 'GET' && endpoint.path === '/sites/{siteId}/structured-contents',
    );
    expect(getEndpoint).toBeDefined();
    expect(getEndpoint?.supportsPagination).toBe(true);
    expect(getEndpoint?.supportsFilter).toBe(true);
    expect(getEndpoint?.supportsSort).toBe(true);
    expect(getEndpoint?.supportsSearch).toBe(true);
    expect(getEndpoint?.responseSchema).toBe('StructuredContent');

    const postEndpoint = result.endpoints.find((endpoint) => endpoint.method === 'POST');
    expect(postEndpoint?.supportsPagination).toBe(false);
    expect(postEndpoint?.requestSchema).toBe('StructuredContent');

    expect(result.schemaCount).toBe(2);
    expect(result.schemas.map((schema) => schema.name)).toEqual(['ContentField', 'StructuredContent']);

    const text = formatLiferayApiDiscover(result);
    expect(text).toContain('GET    /sites/{siteId}/structured-contents  [page,filter,sort,search]');
    expect(text).toContain('auth:');
    expect(text).toContain('ldev portal auth token --raw');
  });

  test('accepts an app name prefixed with /o/', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: '/o/headless-delivery'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.mode).toBe('spec');
    expect(result.app).toBe('headless-delivery');
  });

  test('filters endpoints by --path substring', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: 'headless-delivery', path: 'structured-contents/'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].method).toBe('DELETE');
  });

  test('filters endpoints by --method', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: 'headless-delivery', method: 'post'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].method).toBe('POST');
  });

  test('--schema returns full property details for one schema', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: 'headless-delivery', schema: 'structuredcontent'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.schemaDetail?.name).toBe('StructuredContent');
    expect(result.schemaDetail?.properties).toEqual(
      expect.arrayContaining([
        {name: 'id', type: 'integer', required: false},
        {name: 'title', type: 'string', required: true},
        {name: 'contentFields', type: 'array<object>', required: false},
      ]),
    );
  });

  test('unknown --schema throws a CliError listing available schemas', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    await expect(
      runLiferayApiDiscover(
        CONFIG,
        {app: 'headless-delivery', schema: 'DoesNotExist'},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isCliError(error)).toBe(true);
      expect((error as Error).message).toContain('StructuredContent');
      return true;
    });
  });

  test('--example emits a working curl and fetch snippet', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: 'headless-delivery', example: '/sites/{siteId}/structured-contents'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.example?.method).toBe('GET');
    expect(result.example?.url).toBe(
      'http://localhost:8080/o/headless-delivery/v1.0/sites/{siteId}/structured-contents?page=1&pageSize=20',
    );
    expect(result.example?.curl).toContain('Authorization: Bearer $(ldev portal auth token --raw)');
    expect(result.example?.javascript).toContain('await fetch(');
  });

  test('--example combined with --method selects the write endpoint', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: 'headless-delivery', example: '/sites/{siteId}/structured-contents', method: 'post'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.example?.method).toBe('POST');
    expect(result.example?.curl).toContain('-X POST');
    expect(result.example?.curl).toContain('Content-Type: application/json');
    expect(result.example?.curl).toContain('<StructuredContent JSON>');
  });

  test('unknown --example path throws a CliError', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    await expect(
      runLiferayApiDiscover(
        CONFIG,
        {app: 'headless-delivery', example: '/does/not/exist'},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isCliError(error)).toBe(true);
      return true;
    });
  });

  test('unresolvable app throws a CliError hinting available apps', async () => {
    const apiClient = createLiferayApiClient({fetchImpl: createDiscoverFetchImpl()});

    await expect(
      runLiferayApiDiscover(CONFIG, {app: 'not-a-real-app'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isCliError(error)).toBe(true);
      expect((error as Error).message).toContain('headless-delivery');
      return true;
    });
  });

  test('does not duplicate the version segment when endpoint paths already embed it', async () => {
    const versionEmbeddedSpec = {
      openapi: '3.0.1',
      info: {title: 'Headless Delivery', version: 'v1.0'},
      paths: {
        '/v1.0/asset-libraries/{assetLibraryId}/structured-contents': {
          get: {
            operationId: 'getAssetLibraryStructuredContentsPage',
            parameters: [
              {name: 'assetLibraryId', in: 'path', required: true, schema: {type: 'integer'}},
              {name: 'page', in: 'query', schema: {type: 'integer'}},
              {name: 'pageSize', in: 'query', schema: {type: 'integer'}},
            ],
            responses: {'200': {}},
          },
        },
      },
      components: {schemas: {}},
    };

    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/openapi')) {
          return new Response('forbidden', {status: 403});
        }

        if (url.includes('/o/headless-delivery/v1.0/openapi.json')) {
          return createTestJsonResponse(versionEmbeddedSpec);
        }

        return new Response('not found', {status: 404});
      }),
    });

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: 'headless-delivery', example: 'structured-contents'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.baseUrl).toBe('http://localhost:8080/o/headless-delivery');
    expect(result.example?.url).toBe(
      'http://localhost:8080/o/headless-delivery/v1.0/asset-libraries/{assetLibraryId}/structured-contents?page=1&pageSize=20',
    );
  });

  test('falls back to the /o/<app>/v1.0/openapi.json pattern when the catalog lookup fails', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/o/openapi')) {
          return new Response('forbidden', {status: 403});
        }

        if (url.includes('/o/headless-delivery/v1.0/openapi.json')) {
          return createTestJsonResponse(HEADLESS_DELIVERY_SPEC);
        }

        return new Response('not found', {status: 404});
      }),
    });

    const result = (await runLiferayApiDiscover(
      CONFIG,
      {app: 'headless-delivery'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    )) as ApiDiscoverSpecResult;

    expect(result.mode).toBe('spec');
    expect(result.specPath).toBe('/o/headless-delivery/v1.0/openapi.json');
  });
});
