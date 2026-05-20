import {CliError} from '../../core/errors.js';

const LIFERAY_RELEASES_URL = 'https://releases-cdn.liferay.com/releases.json';

export type LiferayReleaseEntry = {
  product: string;
  productVersion: string;
  promoted: boolean;
  releaseKey: string;
  tags: string[];
  targetPlatformVersion: string;
  url: string;
};

export type LiferayReleaseSelection = LiferayReleaseEntry & {
  dockerImage: string;
};

type RawLiferayReleaseEntry = {
  product?: unknown;
  productVersion?: unknown;
  promoted?: unknown;
  releaseKey?: unknown;
  tags?: unknown;
  targetPlatformVersion?: unknown;
  url?: unknown;
};

export async function fetchLiferayReleases(fetchImpl: typeof fetch = fetch): Promise<LiferayReleaseEntry[]> {
  let response: Response;
  try {
    response = await fetchImpl(LIFERAY_RELEASES_URL);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new CliError(`Unable to fetch Liferay releases: ${message}`, {code: 'PROJECT_RELEASES_FETCH_FAILED'});
  }

  if (!response.ok) {
    throw new CliError(`Unable to fetch Liferay releases: HTTP ${response.status}`, {
      code: 'PROJECT_RELEASES_FETCH_FAILED',
    });
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new CliError('Unable to parse Liferay releases: expected an array.', {
      code: 'PROJECT_RELEASES_INVALID_PAYLOAD',
    });
  }

  return payload.map(normalizeReleaseEntry).filter((entry): entry is LiferayReleaseEntry => entry !== null);
}

export function selectLiferayRelease(releases: LiferayReleaseEntry[], releaseKey: string): LiferayReleaseSelection {
  const normalizedReleaseKey = releaseKey.trim().toLowerCase();
  const release = releases.find((entry) => entry.releaseKey.toLowerCase() === normalizedReleaseKey);

  if (!release) {
    throw new CliError(`Unknown Liferay release version: ${releaseKey}`, {
      code: 'PROJECT_RELEASE_NOT_FOUND',
      details: {
        availableVersions: filterReleaseList(releases)
          .slice(0, 20)
          .map((entry) => entry.releaseKey),
      },
    });
  }

  return {
    ...release,
    dockerImage: getDockerImage(release),
  };
}

export function filterReleaseList(releases: LiferayReleaseEntry[], includeAll = false): LiferayReleaseEntry[] {
  return releases.filter((entry) => includeAll || entry.promoted);
}

function normalizeReleaseEntry(entry: RawLiferayReleaseEntry): LiferayReleaseEntry | null {
  if (
    typeof entry.product !== 'string' ||
    typeof entry.productVersion !== 'string' ||
    typeof entry.releaseKey !== 'string' ||
    typeof entry.targetPlatformVersion !== 'string' ||
    typeof entry.url !== 'string'
  ) {
    return null;
  }

  return {
    product: entry.product,
    productVersion: entry.productVersion,
    promoted: entry.promoted === true || entry.promoted === 'true',
    releaseKey: entry.releaseKey,
    tags: Array.isArray(entry.tags) ? entry.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    targetPlatformVersion: entry.targetPlatformVersion,
    url: entry.url,
  };
}

function getDockerImage(release: LiferayReleaseEntry): string {
  if (release.product === 'dxp') {
    return `liferay/dxp:${release.releaseKey.replace(/^dxp-/, '')}`;
  }

  if (release.product === 'portal') {
    return `liferay/portal:${release.releaseKey.replace(/^portal-/, '')}`;
  }

  return `liferay/${release.product}:${release.releaseKey.replace(new RegExp(`^${release.product}-`), '')}`;
}
