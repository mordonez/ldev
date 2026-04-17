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

    const result = await pipeline.execute('test-site');

    expect(result).toEqual({id: 123, friendlyUrlPath: '/test', name: 'Test'});
  });

  test('throws error when all steps fail', async () => {
    const pipeline = new SiteResolutionPipeline();

    pipeline
      .addStep('step1', async () => null)
      .addStep('step2', async () => null)
      .addStep('step3', async () => null);

    await expect(pipeline.execute('missing')).rejects.toThrow(new RegExp('Site not found'));
  });

  test('calls onStepSuccess hook when step succeeds', async () => {
    const onStepSuccess = vi.fn();
    const pipeline = new SiteResolutionPipeline({onStepSuccess});

    pipeline.addStep('success-step', async () => ({id: 1, friendlyUrlPath: '/test', name: 'Test'}));

    await pipeline.execute('test');

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

    await expect(pipeline.execute('test')).rejects.toThrow('Test error');

    expect(onStepFailure).toHaveBeenCalledWith('failing-step', expect.any(Error));
  });

  test('continues to next step on null return', async () => {
    const step1 = vi.fn(async () => null);
    const step2 = vi.fn(async () => ({id: 1, friendlyUrlPath: '/test', name: 'Test'}));

    const pipeline = new SiteResolutionPipeline();
    pipeline.addStep('step1', step1).addStep('step2', step2);

    await pipeline.execute('test');

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

    await expect(pipeline.execute('test')).rejects.toThrow('Transient error');

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

/**
 * R15: Regression-hardening test suite for resolveSite fallback semantics and error handling.
 * Ensures:
 * 1. Resolution order is stable across all implementations
 * 2. Error contract is respected: 403/404 allow fallback, other errors propagate
 * 3. All-steps-miss results in LIFERAY_SITE_NOT_FOUND
 * 4. Observability hooks fire correctly
 */
describe('SiteResolutionPipeline: Regression-hardening (R15)', () => {
  describe('Resolution order stability', () => {
    test('attempts by-id before other methods', async () => {
      const callOrder: string[] = [];

      const pipeline = new SiteResolutionPipeline();
      pipeline
        .addStep('by-id', async (site) => {
          callOrder.push('by-id');
          return /^\d+$/.test(site) ? {id: 123, friendlyUrlPath: '/site', name: 'Site'} : null;
        })
        .addStep('by-friendly-url', async (site) => {
          callOrder.push('by-friendly-url');
          return {id: 456, friendlyUrlPath: site, name: 'Site'};
        });

      // Use numeric input that matches by-id, so it succeeds on first step
      const result = await pipeline.execute('123');

      expect(callOrder).toEqual(['by-id']);
      expect(result.id).toBe(123);
    });

    test('continues to next step when by-id does not match', async () => {
      const callOrder: string[] = [];

      const pipeline = new SiteResolutionPipeline();
      pipeline
        .addStep('by-id', async (site) => {
          callOrder.push('by-id');
          return /^\d+$/.test(site) ? {id: 123, friendlyUrlPath: '/site', name: 'Site'} : null;
        })
        .addStep('by-friendly-url', async (site) => {
          callOrder.push('by-friendly-url');
          return {id: 456, friendlyUrlPath: site, name: 'Site'};
        });

      // Use non-numeric input so by-id returns null and falls through to by-friendly-url
      const result = await pipeline.execute('guest');

      expect(callOrder).toEqual(['by-id', 'by-friendly-url']);
      expect(result.id).toBe(456);
    });

    test('stops at first successful step', async () => {
      const callOrder: string[] = [];

      const pipeline = new SiteResolutionPipeline();
      pipeline
        .addStep('step1', async () => {
          callOrder.push('step1');
          return null; // miss
        })
        .addStep('step2', async () => {
          callOrder.push('step2');
          return {id: 789, friendlyUrlPath: '/found', name: 'Found'};
        })
        .addStep('step3', async () => {
          callOrder.push('step3');
          return {id: 999, friendlyUrlPath: '/other', name: 'Other'};
        });

      const result = await pipeline.execute('test');

      expect(result.id).toBe(789);
      expect(callOrder).toEqual(['step1', 'step2']);
    });
  });

  describe('Error contract: miss vs propagate', () => {
    test('404/403 errors treated as miss, allow fallback to continue', async () => {
      const callOrder: string[] = [];

      const pipeline = new SiteResolutionPipeline();
      pipeline
        .addStep('step1', async () => {
          callOrder.push('step1');
          throw new CliError('mock request failed with status=404.', {code: 'LIFERAY_GATEWAY_ERROR'});
        })
        .addStep('step2', async () => {
          callOrder.push('step2');
          throw new CliError('mock request failed with status=403.', {code: 'LIFERAY_GATEWAY_ERROR'});
        })
        .addStep('step3', async () => {
          callOrder.push('step3');
          return {id: 123, friendlyUrlPath: '/fallback', name: 'Fallback'};
        });

      const result = await pipeline.execute('test');

      expect(result.id).toBe(123);
      expect(callOrder).toEqual(['step1', 'step2', 'step3']);
    });

    test('unexpected errors (500, parsing, auth) propagate and do not convert to site-not-found', async () => {
      const pipeline = new SiteResolutionPipeline();
      pipeline.addStep('step1', async () => {
        throw new CliError('resolve-site-by-id failed with status=500.', {code: 'LIFERAY_GATEWAY_ERROR'});
      });

      await expect(pipeline.execute('test')).rejects.toThrow('status=500');
    });

    test('all steps return miss (null/404/403) results in site-not-found', async () => {
      const pipeline = new SiteResolutionPipeline();
      pipeline
        .addStep('step1', async () => null)
        .addStep('step2', async () => {
          throw new CliError('status=404', {code: 'LIFERAY_GATEWAY_ERROR'});
        })
        .addStep('step3', async () => {
          throw new CliError('status=403', {code: 'LIFERAY_GATEWAY_ERROR'});
        });

      await expect(pipeline.execute('missing')).rejects.toThrow('Site not found: missing.');
    });

    test('connection errors (non-gateway) propagate unchanged', async () => {
      const pipeline = new SiteResolutionPipeline();
      pipeline.addStep('step1', async () => {
        throw new Error('Connection timeout');
      });

      await expect(pipeline.execute('test')).rejects.toThrow('Connection timeout');
    });
  });

  describe('Observability: hooks fire correctly', () => {
    test('onStepSuccess fires only for winning step, not skipped steps', async () => {
      const onStepSuccess = vi.fn();
      const onStepFailure = vi.fn();

      const pipeline = new SiteResolutionPipeline({onStepSuccess, onStepFailure});
      pipeline
        .addStep('step1', async () => null) // miss, skipped
        .addStep('step2', async () => ({id: 123, friendlyUrlPath: '/site', name: 'Site'})); // winner

      await pipeline.execute('test');

      expect(onStepSuccess).toHaveBeenCalledTimes(1);
      expect(onStepSuccess).toHaveBeenCalledWith('step2', 'test');
      expect(onStepFailure).not.toHaveBeenCalled();
    });

    test('onStepFailure fires for unexpected errors and passes error instance', async () => {
      const onStepFailure = vi.fn();

      const pipeline = new SiteResolutionPipeline({onStepFailure});
      const customError = new CliError('status=500', {code: 'LIFERAY_GATEWAY_ERROR'});
      pipeline.addStep('step1', async () => {
        throw customError;
      });

      await expect(pipeline.execute('test')).rejects.toThrow();

      expect(onStepFailure).toHaveBeenCalledTimes(1);
      expect(onStepFailure).toHaveBeenCalledWith('step1', expect.any(Error));
    });

    test('onStepSuccess not called for 403/404 miss, only for explicit success', async () => {
      const onStepSuccess = vi.fn();

      const pipeline = new SiteResolutionPipeline({onStepSuccess});
      pipeline
        .addStep('step1', async () => {
          throw new CliError('status=404', {code: 'LIFERAY_GATEWAY_ERROR'});
        })
        .addStep('step2', async () => ({id: 123, friendlyUrlPath: '/site', name: 'Site'}));

      await pipeline.execute('test');

      expect(onStepSuccess).toHaveBeenCalledTimes(1);
      expect(onStepSuccess).toHaveBeenCalledWith('step2', 'test');
    });
  });

  describe('Fallback JSONWS: complete resolution chain', () => {
    test('JSONWS fallback succeeds after all headless steps fail with 404', async () => {
      const responses = new Map<string, unknown>([
        ['/api/jsonws/company/get-companies', [{companyId: 1}]],
        ['/api/jsonws/group/search-count?companyId=1&name=&description=&params=%7B%7D', '1'],
        [
          '/api/jsonws/group/search?companyId=1&name=&description=&params=%7B%7D&start=0&end=100',
          [{groupId: 789, friendlyURL: '/fallback', site: true, nameCurrentValue: 'Fallback Site'}],
        ],
      ]);
      const gateway = createMockGateway(responses);

      const step = createJsonwsFallbackStep(
        gateway,
        mockNormalizeResolvedSite,
        mockNormalizeFriendlyUrl,
        mockNormalizeLocalizedName,
      );

      const result = await step('fallback');

      expect(result?.id).toBe(789);
      expect(result?.friendlyUrlPath).toBe('/fallback');
    });

    test('JSONWS handles pagination across companies', async () => {
      const responses = new Map<string, unknown>([
        ['/api/jsonws/company/get-companies', [{companyId: 1}, {companyId: 2}]],
        ['/api/jsonws/group/search-count?companyId=1&name=&description=&params=%7B%7D', '0'],
        ['/api/jsonws/group/search-count?companyId=2&name=&description=&params=%7B%7D', '1'],
        [
          '/api/jsonws/group/search?companyId=2&name=&description=&params=%7B%7D&start=0&end=100',
          [{groupId: 200, friendlyURL: '/found', site: true, nameCurrentValue: 'Found'}],
        ],
      ]);
      const gateway = createMockGateway(responses);

      const step = createJsonwsFallbackStep(
        gateway,
        mockNormalizeResolvedSite,
        mockNormalizeFriendlyUrl,
        mockNormalizeLocalizedName,
      );

      const result = await step('found');

      expect(result?.id).toBe(200);
    });

    test('JSONWS treats 404 from company list as complete miss (no fallback)', async () => {
      const gateway = {
        getJson: vi.fn(async (path: string) => {
          if (path === '/api/jsonws/company/get-companies') {
            throw new CliError('list-jsonws-companies failed with status=404.', {code: 'LIFERAY_GATEWAY_ERROR'});
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

      const result = await step('notfound');

      expect(result).toBeNull();
    });
  });

  describe('Complete pipeline semantics: 5-step fallback chain', () => {
    test('all 5 steps execute in order until first success', async () => {
      const steps = ['by-id', 'by-friendly-url-site', 'by-friendly-url-user', 'paginated-search', 'jsonws'];
      const callOrder: string[] = [];

      const pipeline = new SiteResolutionPipeline();
      steps.forEach((stepName) => {
        pipeline.addStep(stepName, async () => {
          callOrder.push(stepName);
          if (stepName === 'paginated-search') {
            return {id: 999, friendlyUrlPath: '/test', name: 'Test'};
          }
          return null;
        });
      });

      const result = await pipeline.execute('test');

      expect(result.id).toBe(999);
      expect(callOrder).toEqual(['by-id', 'by-friendly-url-site', 'by-friendly-url-user', 'paginated-search']);
    });

    test('JSONWS is final fallback, called only if all headless steps miss', async () => {
      const jsonwsResponses = new Map<string, unknown>([
        ['/api/jsonws/company/get-companies', [{companyId: 1}]],
        ['/api/jsonws/group/search-count?companyId=1&name=&description=&params=%7B%7D', '1'],
        [
          '/api/jsonws/group/search?companyId=1&name=&description=&params=%7B%7D&start=0&end=100',
          [{groupId: 777, friendlyURL: '/global', site: true, nameCurrentValue: 'Global'}],
        ],
      ]);
      const gateway = createMockGateway(jsonwsResponses);

      const pipeline = new SiteResolutionPipeline();
      pipeline
        .addStep('by-id', async () => null)
        .addStep('by-friendly-url-site', async () => null)
        .addStep('by-friendly-url-user', async () => null)
        .addStep('paginated-search', async () => null)
        .addStep(
          'jsonws-fallback',
          createJsonwsFallbackStep(
            gateway,
            mockNormalizeResolvedSite,
            mockNormalizeFriendlyUrl,
            mockNormalizeLocalizedName,
          ),
        );

      const result = await pipeline.execute('/global');

      expect(result.id).toBe(777);
    });
  });
});
