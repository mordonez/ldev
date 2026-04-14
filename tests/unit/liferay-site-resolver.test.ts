import {describe, expect, test, vi} from 'vitest';

import type {LiferayGateway} from '../../src/features/liferay/liferay-gateway.js';
import {CliError} from '../../src/core/errors.js';
import {
  SiteResolutionPipeline,
  createByIdStep,
  createByFriendlyUrlHeadlessSiteStep,
  createByFriendlyUrlHeadlessUserStep,
  createPaginatedSearchStep,
  createJsonwsFallbackStep,
  type ResolvedSite,
  type SiteLookupPayload,
} from '../../src/features/liferay/inventory/liferay-site-resolver.js';

const mockNormalizeResolvedSite = (payload: SiteLookupPayload | null, _original: string): ResolvedSite => {
  const id = payload?.id ?? -1;
  if (id <= 0) {
    throw new CliError('Site not found', {code: 'LIFERAY_SITE_NOT_FOUND'});
  }
  return {
    id,
    friendlyUrlPath: payload?.friendlyUrlPath ?? '',
    name: typeof payload?.name === 'string' ? payload.name : '',
  };
};

const createMockGateway = (responses: Map<string, unknown> = new Map()): LiferayGateway => {
  const mockGateway = {
    getJson: vi.fn(async (path: string, _label: string) => {
      if (responses.has(path)) {
        return responses.get(path);
      }
      throw new CliError('mock request failed with status=404.', {code: 'LIFERAY_GATEWAY_ERROR'});
    }),
    postJson: vi.fn(),
    postForm: vi.fn(),
    postMultipart: vi.fn(),
    putJson: vi.fn(),
    clearTokenCache: vi.fn(),
  };
  return mockGateway as unknown as LiferayGateway;
};

const mockNormalizeFriendlyUrl = (url: string) => (url.startsWith('/') ? url : `/${url}`);

const mockNormalizeLocalizedName = (name: string | Record<string, string> | undefined): string => {
  if (typeof name === 'string') return name;
  if (!name || typeof name !== 'object') return '';
  const first = Object.values(name).find((item) => String(item).trim() !== '');
  return String(first ?? '');
};

describe('SiteResolutionPipeline', () => {
  test('executes steps in order and returns first successful result', async () => {
    const pipeline = new SiteResolutionPipeline();

    pipeline
      .addStep('step1', async () => null) // Return null to continue
      .addStep('step2', async () => ({id: 123, friendlyUrlPath: '/test', name: 'Test'})) // Success
      .addStep('step3', async () => {
        throw new Error('Should not reach here');
      });

    const result = await pipeline.execute('test-site', 'Not found');

    expect(result).toEqual({id: 123, friendlyUrlPath: '/test', name: 'Test'});
  });

  test('throws error when all steps fail', async () => {
    const pipeline = new SiteResolutionPipeline();

    pipeline
      .addStep('step1', async () => null)
      .addStep('step2', async () => null)
      .addStep('step3', async () => null);

    await expect(pipeline.execute('missing', 'Custom error message')).rejects.toThrow(
      new RegExp('Custom error message'),
    );
  });

  test('calls onStepSuccess hook when step succeeds', async () => {
    const onStepSuccess = vi.fn();
    const pipeline = new SiteResolutionPipeline({onStepSuccess});

    pipeline.addStep('success-step', async () => ({id: 1, friendlyUrlPath: '/test', name: 'Test'}));

    await pipeline.execute('test', 'Not found');

    expect(onStepSuccess).toHaveBeenCalledWith('success-step', 'test');
  });

  test('calls onStepFailure hook when step throws', async () => {
    const onStepFailure = vi.fn();
    const pipeline = new SiteResolutionPipeline({onStepFailure});

    pipeline
      .addStep('failing-step', async () => {
        throw new Error('Test error');
      })
      .addStep('recovery-step', async () => ({id: 1, friendlyUrlPath: '/test', name: 'Test'}));

    await expect(pipeline.execute('test', 'Not found')).rejects.toThrow('Test error');

    expect(onStepFailure).toHaveBeenCalledWith('failing-step', expect.any(Error));
  });

  test('continues to next step on null return', async () => {
    const step1 = vi.fn(async () => null);
    const step2 = vi.fn(async () => ({id: 1, friendlyUrlPath: '/test', name: 'Test'}));

    const pipeline = new SiteResolutionPipeline();
    pipeline.addStep('step1', step1).addStep('step2', step2);

    await pipeline.execute('test', 'Not found');

    expect(step1).toHaveBeenCalledWith('test');
    expect(step2).toHaveBeenCalledWith('test');
  });

  test('rethrows unexpected errors', async () => {
    const step1 = vi.fn(async () => {
      throw new Error('Transient error');
    });
    const step2 = vi.fn(async () => ({id: 1, friendlyUrlPath: '/test', name: 'Test'}));

    const onStepFailure = vi.fn();
    const pipeline = new SiteResolutionPipeline({onStepFailure});
    pipeline.addStep('step1', step1).addStep('step2', step2);

    await expect(pipeline.execute('test', 'Not found')).rejects.toThrow('Transient error');

    expect(step1).toHaveBeenCalled();
    expect(step2).not.toHaveBeenCalled();
    expect(onStepFailure).toHaveBeenCalledWith('step1', expect.any(Error));
  });
});

describe('createByIdStep', () => {
  test('attempts by ID only if input is numeric', async () => {
    const responses = new Map([['/o/headless-admin-site/v1.0/sites/123', {id: 123, friendlyUrlPath: '/site'}]]);
    const gateway = createMockGateway(responses);

    const step = createByIdStep(gateway, mockNormalizeResolvedSite);
    const result = await step('123');

    expect(result).toEqual({id: 123, friendlyUrlPath: '/site', name: ''});
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(gateway.getJson).toHaveBeenCalledWith('/o/headless-admin-site/v1.0/sites/123', 'resolve-site-by-id');
  });

  test('returns null for non-numeric input', async () => {
    const gateway = createMockGateway();

    const step = createByIdStep(gateway, mockNormalizeResolvedSite);
    const result = await step('not-a-number');

    expect(result).toBeNull();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(gateway.getJson).not.toHaveBeenCalled();
  });

  test('returns null when gateway throws error', async () => {
    const gateway = createMockGateway(); // Empty map will throw on any request

    const step = createByIdStep(gateway, mockNormalizeResolvedSite);
    const result = await step('456');

    expect(result).toBeNull();
  });

  test('rethrows unexpected gateway errors', async () => {
    const gateway = {
      getJson: vi.fn(async () => {
        throw new CliError('resolve-site-by-id failed with status=500.', {code: 'LIFERAY_GATEWAY_ERROR'});
      }),
      postJson: vi.fn(),
      postForm: vi.fn(),
      postMultipart: vi.fn(),
      putJson: vi.fn(),
      clearTokenCache: vi.fn(),
    } as unknown as LiferayGateway;

    const step = createByIdStep(gateway, mockNormalizeResolvedSite);

    await expect(step('456')).rejects.toThrow('status=500');
  });
});

describe('createByFriendlyUrlHeadlessSiteStep', () => {
  test('resolves by friendly URL', async () => {
    const responses = new Map([
      [
        '/o/headless-admin-site/v1.0/sites/by-friendly-url-path/my-site',
        {id: 789, friendlyUrlPath: '/my-site', name: 'My Site'},
      ],
    ]);
    const gateway = createMockGateway(responses);

    const step = createByFriendlyUrlHeadlessSiteStep(gateway, mockNormalizeResolvedSite);
    const result = await step('/my-site');

    expect(result?.id).toBe(789);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(gateway.getJson).toHaveBeenCalledWith(
      '/o/headless-admin-site/v1.0/sites/by-friendly-url-path/my-site',
      'resolve-site-by-friendly-url-site',
    );
  });

  test('handles URL encoding in friendly URL', async () => {
    const responses = new Map([
      ['/o/headless-admin-site/v1.0/sites/by-friendly-url-path/my-site-with-accents', {id: 100}],
    ]);
    const gateway = createMockGateway(responses);

    const step = createByFriendlyUrlHeadlessSiteStep(gateway, mockNormalizeResolvedSite);
    await step('/my-site-with-accents');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(gateway.getJson).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const callPath = vi.mocked(gateway.getJson).mock.calls[0][0];
    expect(callPath).toContain('by-friendly-url-path');
  });

  test('returns null when gateway throws error', async () => {
    const gateway = createMockGateway(); // Empty map will throw on any request

    const step = createByFriendlyUrlHeadlessSiteStep(gateway, mockNormalizeResolvedSite);
    const result = await step('/missing');

    expect(result).toBeNull();
  });
});

describe('createByFriendlyUrlHeadlessUserStep', () => {
  test('resolves by friendly URL via headless-admin-user', async () => {
    const responses = new Map([
      ['/o/headless-admin-user/v1.0/sites/by-friendly-url-path/global', {id: 200, friendlyUrlPath: '/global'}],
    ]);
    const gateway = createMockGateway(responses);

    const step = createByFriendlyUrlHeadlessUserStep(gateway, mockNormalizeResolvedSite);
    const result = await step('/global');

    expect(result?.id).toBe(200);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(gateway.getJson).toHaveBeenCalledWith(
      expect.stringContaining('headless-admin-user'),
      'resolve-site-by-friendly-url-user',
    );
  });

  test('returns null when gateway throws error', async () => {
    const gateway = createMockGateway(); // Empty map will throw on any request

    const step = createByFriendlyUrlHeadlessUserStep(gateway, mockNormalizeResolvedSite);
    const result = await step('/notfound');

    expect(result).toBeNull();
  });
});

describe('createJsonwsFallbackStep', () => {
  test('rethrows unexpected JSONWS errors', async () => {
    const gateway = {
      getJson: vi.fn(async (path: string) => {
        if (path === '/api/jsonws/company/get-companies') {
          throw new CliError('list-jsonws-companies failed with status=500.', {code: 'LIFERAY_GATEWAY_ERROR'});
        }
        throw new Error(`Unexpected path ${path}`);
      }),
      postJson: vi.fn(),
      postForm: vi.fn(),
      postMultipart: vi.fn(),
      putJson: vi.fn(),
      clearTokenCache: vi.fn(),
    } as unknown as LiferayGateway;

    const step = createJsonwsFallbackStep(
      gateway,
      mockNormalizeResolvedSite,
      mockNormalizeFriendlyUrl,
      mockNormalizeLocalizedName,
    );

    await expect(step('/global')).rejects.toThrow('status=500');
  });
});

describe('createPaginatedSearchStep', () => {
  test('searches paginated results for matching site', async () => {
    const responses = new Map([
      [
        '/o/headless-admin-site/v1.0/sites?pageSize=100&page=1',
        {
          items: [
            {id: 1, friendlyUrlPath: '/site1', name: 'Site One'},
            {id: 2, friendlyUrlPath: '/site2', name: 'Site Two'},
          ],
          lastPage: 1,
        },
      ],
    ]);
    const gateway = createMockGateway(responses);

    const step = createPaginatedSearchStep(
      gateway,
      mockNormalizeResolvedSite,
      mockNormalizeFriendlyUrl,
      mockNormalizeLocalizedName,
    );

    const result = await step('site2');

    expect(result?.id).toBe(2);
  });

  test('returns null when no matches found', async () => {
    const responses = new Map([['/o/headless-admin-site/v1.0/sites?pageSize=100&page=1', {items: [], lastPage: 1}]]);
    const gateway = createMockGateway(responses);

    const step = createPaginatedSearchStep(
      gateway,
      mockNormalizeResolvedSite,
      mockNormalizeFriendlyUrl,
      mockNormalizeLocalizedName,
    );

    const result = await step('notfound');

    expect(result).toBeNull();
  });

  test('stops on error during pagination', async () => {
    const gateway = createMockGateway(); // Empty map will throw on first request

    const step = createPaginatedSearchStep(
      gateway,
      mockNormalizeResolvedSite,
      mockNormalizeFriendlyUrl,
      mockNormalizeLocalizedName,
    );

    const result = await step('test');

    expect(result).toBeNull();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(gateway.getJson).toHaveBeenCalledTimes(1);
  });

  test('handles pagination correctly', async () => {
    const responses = new Map([
      ['/o/headless-admin-site/v1.0/sites?pageSize=100&page=1', {items: [{id: 1}], lastPage: 2}],
      [
        '/o/headless-admin-site/v1.0/sites?pageSize=100&page=2',
        {items: [{id: 2, friendlyUrlPath: '/found'}], lastPage: 2},
      ],
    ]);
    const gateway = createMockGateway(responses);

    const step = createPaginatedSearchStep(
      gateway,
      mockNormalizeResolvedSite,
      mockNormalizeFriendlyUrl,
      mockNormalizeLocalizedName,
    );

    const result = await step('found');

    expect(result?.id).toBe(2);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(gateway.getJson).toHaveBeenCalledTimes(2);
  });
});
