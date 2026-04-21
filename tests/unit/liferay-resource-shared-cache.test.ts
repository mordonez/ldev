import {beforeEach, describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {classNameIdLookupCache} from '../../src/features/liferay/lookup-cache.js';
import {fetchClassNameIdForValue} from '../../src/features/liferay/resource/liferay-resource-shared.js';
import {createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';

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

beforeEach(() => {
  classNameIdLookupCache.clear();
});

describe('liferay resource shared classNameId cache integration', () => {
  test('reuses cached classNameId for repeated lookup', async () => {
    let classNameCalls = 0;
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/api/jsonws/classname/fetch-class-name?value=')) {
          classNameCalls += 1;
          return new Response(JSON.stringify({classNameId: 7000 + classNameCalls}), {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const first = await fetchClassNameIdForValue(CONFIG, 'com.example.Model', {
      apiClient,
      accessToken: 'token-123',
    });
    const second = await fetchClassNameIdForValue(CONFIG, 'com.example.Model', {
      apiClient,
      accessToken: 'token-123',
    });

    expect(first).toBe(7001);
    expect(second).toBe(7001);
    expect(classNameCalls).toBe(1);
  });

  test('forceRefresh bypasses cached classNameId', async () => {
    let classNameCalls = 0;
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        if (url.includes('/api/jsonws/classname/fetch-class-name?value=')) {
          classNameCalls += 1;
          return new Response(JSON.stringify({classNameId: 9000 + classNameCalls}), {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const first = await fetchClassNameIdForValue(CONFIG, 'com.example.Model', {
      apiClient,
      accessToken: 'token-123',
    });
    const second = await fetchClassNameIdForValue(CONFIG, 'com.example.Model', {
      apiClient,
      accessToken: 'token-123',
      forceRefresh: true,
    });

    expect(first).toBe(9001);
    expect(second).toBe(9002);
    expect(classNameCalls).toBe(2);
  });
});
