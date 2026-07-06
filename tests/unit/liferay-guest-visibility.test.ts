import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {isCliError} from '../../src/core/errors.js';
import {
  runGuestVisibilityDiagnosis,
  formatGuestVisibilityReport,
} from '../../src/features/liferay/diagnose/liferay-guest-visibility.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';

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

function hasAuthHeader(init?: RequestInit): boolean {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return Boolean(headers.Authorization);
}

function emptyPage() {
  return new Response('{"items":[],"lastPage":1}', {status: 200});
}

describe('guest-visibility diagnosis', () => {
  test('reports a permission gap for a structured content missing Guest View', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, init) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('/structured-contents?flatten=true')) {
          if (hasAuthHeader(init)) {
            return new Response(
              '{"items":[{"id":1,"title":"Headless Article"},{"id":2,"title":"UI Article"}],"lastPage":1}',
              {status: 200},
            );
          }
          // Anonymous view is missing item 1: it lacks Guest View.
          return new Response('{"items":[{"id":2,"title":"UI Article"}],"lastPage":1}', {status: 200});
        }

        if (url.includes('/documents?flatten=true')) {
          return emptyPage();
        }

        if (url.endsWith('/structured-contents/1/permissions')) {
          return new Response('[{"roleName":"Owner","actionIds":["VIEW","UPDATE"]}]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const report = await runGuestVisibilityDiagnosis(
      CONFIG,
      {site: '/guest'},
      {apiClient, tokenClient: TOKEN_CLIENT, now: () => new Date('2026-03-26T12:00:00.000Z')},
    );

    expect(report.ok).toBe(false);
    expect(report.checked).toEqual({structuredContents: 2, documents: 0});
    expect(report.anonymousApiAccessible).toEqual({structuredContents: true, documents: true});
    expect(report.gaps).toHaveLength(1);

    const [gap] = report.gaps;
    expect(gap).toMatchObject({
      resourceType: 'structuredContent',
      id: 1,
      title: 'Headless Article',
      guestHasViewPermission: false,
      missingPermission: 'VIEW',
    });
    expect(gap.diagnosis).toContain('Missing VIEW permission for role Guest');
    expect(gap.fix).toContain('/o/headless-delivery/v1.0/structured-contents/1/permissions');

    const text = formatGuestVisibilityReport(report);
    expect(text).toContain('GUEST_VISIBILITY_GAPS');
    expect(text).toContain('Missing VIEW permission for role Guest');
  });

  test('detects a page hidden anonymously via --url', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, init) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.endsWith('/site-pages/home')) {
          if (hasAuthHeader(init)) {
            return new Response('{"id":5001,"title":"Home"}', {status: 200});
          }
          return new Response('{}', {status: 403});
        }

        if (url.includes('/structured-contents?flatten=true') || url.includes('/documents?flatten=true')) {
          return emptyPage();
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const report = await runGuestVisibilityDiagnosis(
      CONFIG,
      {url: '/web/guest/home'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(report.page).toMatchObject({
      friendlyUrl: '/home',
      visibleAuthenticated: true,
      visibleAnonymously: false,
      anonymousStatus: 403,
    });
    expect(report.ok).toBe(false);
    expect(report.gaps).toHaveLength(0);
  });

  test('falls back to a permissions-only check when the anonymous list endpoint itself is blocked', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url, init) => {
        if (url.includes('/by-friendly-url-path/guest')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/guest","name":"Guest"}', {status: 200});
        }

        if (url.includes('/structured-contents?flatten=true')) {
          if (hasAuthHeader(init)) {
            return new Response(
              '{"items":[{"id":1,"title":"No Guest View"},{"id":2,"title":"Has Guest View"}],"lastPage":1}',
              {status: 200},
            );
          }
          return new Response('{}', {status: 403});
        }

        if (url.includes('/documents?flatten=true')) {
          return emptyPage();
        }

        if (url.endsWith('/structured-contents/1/permissions')) {
          return new Response('[{"roleName":"Owner","actionIds":["VIEW"]}]', {status: 200});
        }

        if (url.endsWith('/structured-contents/2/permissions')) {
          return new Response('[{"roleName":"Guest","actionIds":["VIEW"]}]', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    const report = await runGuestVisibilityDiagnosis(CONFIG, {site: '/guest'}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(report.anonymousApiAccessible.structuredContents).toBe(false);
    expect(report.notes.some((note) => note.includes('structuredContents'))).toBe(true);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0]).toMatchObject({id: 1, missingPermission: 'VIEW'});
  });

  test('requires --url or --site', async () => {
    const apiClient = createLiferayApiClient({
      fetchImpl: createTestFetchImpl((url) => {
        throw new Error(`Unexpected URL ${url}`);
      }),
    });

    await expect(runGuestVisibilityDiagnosis(CONFIG, {}, {apiClient, tokenClient: TOKEN_CLIENT})).rejects.toSatisfy(
      (error: unknown) => isCliError(error) && error.code === 'LIFERAY_DIAGNOSE_ERROR',
    );
  });
});
