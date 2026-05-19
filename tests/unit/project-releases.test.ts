import {describe, expect, test} from 'vitest';

import {
  fetchLiferayReleases,
  filterReleaseList,
  selectLiferayRelease,
  type LiferayReleaseEntry,
} from '../../src/features/project/project-releases.js';

const dxpRelease: LiferayReleaseEntry = {
  product: 'dxp',
  productVersion: 'DXP 2026.Q1.7 LTS',
  promoted: true,
  releaseKey: 'dxp-2026.q1.7-lts',
  tags: ['recommended', 'supported'],
  targetPlatformVersion: '2026.q1.7',
  url: 'https://releases-cdn.liferay.com/dxp/2026.q1.7-lts',
};

const portalRelease: LiferayReleaseEntry = {
  product: 'portal',
  productVersion: 'Portal 7.4 GA100',
  promoted: false,
  releaseKey: 'portal-7.4.3.100-ga100',
  tags: [],
  targetPlatformVersion: '7.4.3.100',
  url: 'https://releases-cdn.liferay.com/portal/7.4.3.100-ga100',
};

describe('filterReleaseList', () => {
  const releases = [dxpRelease, portalRelease];

  test('returns only promoted releases by default', () => {
    const result = filterReleaseList(releases);
    expect(result).toHaveLength(1);
    expect(result[0].releaseKey).toBe('dxp-2026.q1.7-lts');
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
    const selection = selectLiferayRelease(releases, 'dxp-2026.q1.7-lts');
    expect(selection.releaseKey).toBe('dxp-2026.q1.7-lts');
    expect(selection.dockerImage).toBe('liferay/dxp:2026.q1.7-lts');
  });

  test('selects a portal release and derives its docker image', () => {
    const selection = selectLiferayRelease(releases, 'portal-7.4.3.100-ga100');
    expect(selection.releaseKey).toBe('portal-7.4.3.100-ga100');
    expect(selection.dockerImage).toBe('liferay/portal:7.4.3.100-ga100');
  });

  test('matching is case-insensitive', () => {
    const selection = selectLiferayRelease(releases, 'DXP-2026.Q1.7-LTS');
    expect(selection.releaseKey).toBe('dxp-2026.q1.7-lts');
  });

  test('matching trims whitespace', () => {
    const selection = selectLiferayRelease(releases, '  dxp-2026.q1.7-lts  ');
    expect(selection.releaseKey).toBe('dxp-2026.q1.7-lts');
  });

  test('throws CliError with code PROJECT_RELEASE_NOT_FOUND when key is unknown', () => {
    expect(() => selectLiferayRelease(releases, 'dxp-9999.q9.9')).toThrow(
      expect.objectContaining({code: 'PROJECT_RELEASE_NOT_FOUND'}),
    );
  });

  test('error details include available (promoted) versions', () => {
    let caught: unknown;
    try {
      selectLiferayRelease(releases, 'dxp-9999.q9.9');
    } catch (error) {
      caught = error;
    }
    expect((caught as {details?: {availableVersions?: unknown}}).details?.availableVersions).toContain(
      'dxp-2026.q1.7-lts',
    );
  });

  test('selection spreads all original release fields', () => {
    const selection = selectLiferayRelease(releases, 'dxp-2026.q1.7-lts');
    expect(selection.productVersion).toBe(dxpRelease.productVersion);
    expect(selection.targetPlatformVersion).toBe(dxpRelease.targetPlatformVersion);
    expect(selection.promoted).toBe(true);
    expect(selection.tags).toEqual(dxpRelease.tags);
  });
});

describe('fetchLiferayReleases', () => {
  function makeJsonFetch(payload: unknown, status = 200): typeof fetch {
    return async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      }) as Response;
  }

  function makeNetworkErrorFetch(): typeof fetch {
    return async () => {
      throw new Error('getaddrinfo ENOTFOUND releases-cdn.liferay.com');
    };
  }

  test('parses a valid releases array and returns normalized entries', async () => {
    const payload = [
      {
        product: 'dxp',
        productVersion: 'DXP 2026.Q1.7 LTS',
        promoted: true,
        releaseKey: 'dxp-2026.q1.7-lts',
        tags: ['recommended'],
        targetPlatformVersion: '2026.q1.7',
        url: 'https://releases-cdn.liferay.com/dxp/2026.q1.7-lts',
      },
    ];
    const releases = await fetchLiferayReleases(makeJsonFetch(payload));
    expect(releases).toHaveLength(1);
    expect(releases[0].releaseKey).toBe('dxp-2026.q1.7-lts');
    expect(releases[0].promoted).toBe(true);
  });

  test('accepts promoted as string "true"', async () => {
    const payload = [
      {
        product: 'dxp',
        productVersion: 'DXP 2026.Q1.7 LTS',
        promoted: 'true',
        releaseKey: 'dxp-2026.q1.7-lts',
        tags: [],
        targetPlatformVersion: '2026.q1.7',
        url: 'https://example.com',
      },
    ];
    const releases = await fetchLiferayReleases(makeJsonFetch(payload));
    expect(releases[0].promoted).toBe(true);
  });

  test('silently drops entries with missing required fields', async () => {
    const payload = [
      {product: 'dxp', productVersion: 'DXP 2026.Q1.7 LTS', promoted: true, releaseKey: 'dxp-2026.q1.7-lts'},
    ];
    const releases = await fetchLiferayReleases(makeJsonFetch(payload));
    expect(releases).toHaveLength(0);
  });

  test('normalizes missing tags to empty array', async () => {
    const payload = [
      {
        product: 'dxp',
        productVersion: 'DXP 2026.Q1.7 LTS',
        promoted: false,
        releaseKey: 'dxp-2026.q1.7-lts',
        targetPlatformVersion: '2026.q1.7',
        url: 'https://example.com',
      },
    ];
    const releases = await fetchLiferayReleases(makeJsonFetch(payload));
    expect(releases[0].tags).toEqual([]);
  });

  test('throws CliError with code PROJECT_RELEASES_FETCH_FAILED on HTTP error', async () => {
    await expect(fetchLiferayReleases(makeJsonFetch(null, 503))).rejects.toThrow(
      expect.objectContaining({code: 'PROJECT_RELEASES_FETCH_FAILED'}),
    );
  });

  test('throws CliError with code PROJECT_RELEASES_FETCH_FAILED on network failure', async () => {
    await expect(fetchLiferayReleases(makeNetworkErrorFetch())).rejects.toThrow(
      expect.objectContaining({code: 'PROJECT_RELEASES_FETCH_FAILED'}),
    );
  });

  test('throws CliError with code PROJECT_RELEASES_INVALID_PAYLOAD when response is not an array', async () => {
    await expect(fetchLiferayReleases(makeJsonFetch({releases: []}))).rejects.toThrow(
      expect.objectContaining({code: 'PROJECT_RELEASES_INVALID_PAYLOAD'}),
    );
  });
});
