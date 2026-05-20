import {describe, expect, test} from 'vitest';

import {
  fetchLiferayReleases,
  filterReleaseList,
  selectLiferayRelease,
  type LiferayReleaseEntry,
} from '../../src/features/project/project-releases.js';

const TEST_DXP_RELEASE_KEY = 'dxp-test-lts';
const TEST_PORTAL_RELEASE_KEY = 'portal-ga';

const dxpRelease: LiferayReleaseEntry = {
  product: 'dxp',
  productVersion: 'DXP 2026.Q1.7 LTS',
  promoted: true,
  releaseKey: TEST_DXP_RELEASE_KEY,
  tags: ['recommended', 'supported'],
  targetPlatformVersion: '2026.q1.7',
  url: 'https://releases-cdn.liferay.com/dxp/2026.q1.7-lts',
};

const portalRelease: LiferayReleaseEntry = {
  product: 'portal',
  productVersion: 'Portal 7.4 GA100',
  promoted: false,
  releaseKey: TEST_PORTAL_RELEASE_KEY,
  tags: [],
  targetPlatformVersion: '7.4.3.100',
  url: 'https://releases-cdn.liferay.com/portal/7.4.3.100-ga100',
};

describe('filterReleaseList', () => {
  const releases = [dxpRelease, portalRelease];

  test('returns only promoted releases by default', () => {
    const result = filterReleaseList(releases);
    expect(result).toHaveLength(1);
    expect(result[0].releaseKey).toBe(TEST_DXP_RELEASE_KEY);
  });

  test('returns all releases when includeAll is true', () => {
    const result = filterReleaseList(releases, true);
    expect(result).toHaveLength(2);
  });

  test('returns empty array when no releases are promoted', () => {
    expect(filterReleaseList([portalRelease])).toHaveLength(0);
  });
});

describe('selectLiferayRelease', () => {
  const releases = [dxpRelease, portalRelease];

  test('selects a dxp release and derives its docker image', () => {
    const selection = selectLiferayRelease(releases, TEST_DXP_RELEASE_KEY);
    expect(selection.releaseKey).toBe(TEST_DXP_RELEASE_KEY);
    expect(selection.dockerImage).toBe('liferay/dxp:test-lts');
  });

  test('selects a portal release and derives its docker image', () => {
    const selection = selectLiferayRelease(releases, TEST_PORTAL_RELEASE_KEY);
    expect(selection.releaseKey).toBe(TEST_PORTAL_RELEASE_KEY);
    expect(selection.dockerImage).toBe('liferay/portal:ga');
  });

  test('matching is case-insensitive', () => {
    const selection = selectLiferayRelease(releases, 'DXP-TEST-LTS');
    expect(selection.releaseKey).toBe(TEST_DXP_RELEASE_KEY);
  });

  test('matching trims whitespace', () => {
    const selection = selectLiferayRelease(releases, `  ${TEST_DXP_RELEASE_KEY}  `);
    expect(selection.releaseKey).toBe(TEST_DXP_RELEASE_KEY);
  });

  test('throws CliError with code PROJECT_RELEASE_NOT_FOUND when key is unknown', () => {
    expectCliErrorCode(() => selectLiferayRelease(releases, 'dxp-missing'), 'PROJECT_RELEASE_NOT_FOUND');
  });

  test('error details include available (promoted) versions', () => {
    let caught: unknown;
    try {
      selectLiferayRelease(releases, 'dxp-missing');
    } catch (error) {
      caught = error;
    }
    expect((caught as {details?: {availableVersions?: unknown}}).details?.availableVersions).toContain(
      TEST_DXP_RELEASE_KEY,
    );
  });

  test('selection spreads all original release fields', () => {
    const selection = selectLiferayRelease(releases, TEST_DXP_RELEASE_KEY);
    expect(selection.productVersion).toBe(dxpRelease.productVersion);
    expect(selection.targetPlatformVersion).toBe(dxpRelease.targetPlatformVersion);
    expect(selection.promoted).toBe(true);
    expect(selection.tags).toEqual(dxpRelease.tags);
  });
});

describe('fetchLiferayReleases', () => {
  function makeJsonFetch(payload: unknown, status = 200): typeof fetch {
    return async () => {
      await Promise.resolve();
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
          await Promise.resolve();
          return payload;
        },
      } as Response;
    };
  }

  function makeNetworkErrorFetch(): typeof fetch {
    return async () => {
      await Promise.resolve();
      throw new Error('getaddrinfo ENOTFOUND releases-cdn.liferay.com');
    };
  }

  test('parses a valid releases array and returns normalized entries', async () => {
    const payload = [
      {
        product: 'dxp',
        productVersion: 'DXP 2026.Q1.7 LTS',
        promoted: true,
        releaseKey: TEST_DXP_RELEASE_KEY,
        tags: ['recommended'],
        targetPlatformVersion: '2026.q1.7',
        url: 'https://releases-cdn.liferay.com/dxp/2026.q1.7-lts',
      },
    ];
    const releases = await fetchLiferayReleases(makeJsonFetch(payload));
    expect(releases).toHaveLength(1);
    expect(releases[0].releaseKey).toBe(TEST_DXP_RELEASE_KEY);
    expect(releases[0].promoted).toBe(true);
  });

  test('accepts promoted as string "true"', async () => {
    const payload = [
      {
        product: 'dxp',
        productVersion: 'DXP 2026.Q1.7 LTS',
        promoted: 'true',
        releaseKey: TEST_DXP_RELEASE_KEY,
        tags: [],
        targetPlatformVersion: '2026.q1.7',
        url: 'https://example.com',
      },
    ];
    const releases = await fetchLiferayReleases(makeJsonFetch(payload));
    expect(releases[0].promoted).toBe(true);
  });

  test('silently drops entries with missing required fields', async () => {
    const payload = [{product: 'dxp', productVersion: 'DXP 2026.Q1.7 LTS', promoted: true, releaseKey: 'dxp-test'}];
    const releases = await fetchLiferayReleases(makeJsonFetch(payload));
    expect(releases).toHaveLength(0);
  });

  test('normalizes missing tags to empty array', async () => {
    const payload = [
      {
        product: 'dxp',
        productVersion: 'DXP 2026.Q1.7 LTS',
        promoted: false,
        releaseKey: TEST_DXP_RELEASE_KEY,
        targetPlatformVersion: '2026.q1.7',
        url: 'https://example.com',
      },
    ];
    const releases = await fetchLiferayReleases(makeJsonFetch(payload));
    expect(releases[0].tags).toEqual([]);
  });

  test('throws CliError with code PROJECT_RELEASES_FETCH_FAILED on HTTP error', async () => {
    await expectCliErrorCodeAsync(fetchLiferayReleases(makeJsonFetch(null, 503)), 'PROJECT_RELEASES_FETCH_FAILED');
  });

  test('throws CliError with code PROJECT_RELEASES_FETCH_FAILED on network failure', async () => {
    await expectCliErrorCodeAsync(fetchLiferayReleases(makeNetworkErrorFetch()), 'PROJECT_RELEASES_FETCH_FAILED');
  });

  test('throws CliError with code PROJECT_RELEASES_INVALID_PAYLOAD when response is not an array', async () => {
    await expectCliErrorCodeAsync(
      fetchLiferayReleases(makeJsonFetch({releases: []})),
      'PROJECT_RELEASES_INVALID_PAYLOAD',
    );
  });
});

function expectCliErrorCode(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({code});
    return;
  }

  throw new Error(`Expected action to throw ${code}`);
}

async function expectCliErrorCodeAsync(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toMatchObject({code});
    return;
  }

  throw new Error(`Expected promise to reject with ${code}`);
}
