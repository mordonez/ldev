import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {runLiferayRedirectsImport} from '../../src/features/liferay/redirects/liferay-redirects-import.js';
import {readRedirectMap} from '../../src/features/liferay/redirects/liferay-redirects-shared.js';
import {createStaticTokenClient, createTestFetchImpl, toTestRequestBody} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CONFIG = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: '/repo/docker',
  liferayDir: '/repo/liferay',
  files: {dockerEnv: null, liferayProfile: null},
  liferay: {
    url: 'http://localhost:8080',
    oauth2ClientId: 'id',
    oauth2ClientSecret: 's',
    scopeAliases: '',
    timeoutSeconds: 5,
  },
};

type Stored = {redirectEntryId: number; sourceURL: string; destinationURL: string; permanent: boolean};

/** JSONWS redirect service + site lookup; `failAdd` answers like a duplicate source. */
function createRedirectPortal(initial: Stored[], options: {failAdd?: boolean; ignoreUpdates?: boolean} = {}) {
  const entries = [...initial];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});
  const fetchImpl = createTestFetchImpl((url, init) => {
    const {pathname} = new URL(url);
    const form = new URLSearchParams(init?.body ? toTestRequestBody(init.body) : '');
    if (pathname.includes('/sites/') || pathname.includes('/group/get-group')) {
      return json({id: 20, friendlyUrlPath: '/facultat-b', name: 'B', companyId: 1});
    }
    if (pathname.endsWith('/get-redirect-entries')) {
      return json(
        entries.map((entry) => ({...entry, redirectEntryId: String(entry.redirectEntryId), expirationDate: null})),
      );
    }
    if (pathname.endsWith('/add-redirect-entry')) {
      if (options.failAdd) {
        return json({exception: 'com.liferay.redirect.exception.DuplicateRedirectEntrySourceURLException'});
      }
      const entry = {
        redirectEntryId: entries.length + 100,
        sourceURL: form.get('sourceURL') ?? '',
        destinationURL: form.get('destinationURL') ?? '',
        permanent: form.get('permanent') === 'true',
      };
      entries.push(entry);
      return json({...entry, expirationDate: null});
    }
    if (pathname.endsWith('/update-redirect-entry')) {
      const entry = entries.find((item) => item.redirectEntryId === Number(form.get('redirectEntryId')));
      if (entry && !options.ignoreUpdates) {
        entry.destinationURL = form.get('destinationURL') ?? '';
        entry.permanent = form.get('permanent') === 'true';
      }
      return json({...entry, expirationDate: null});
    }
    throw new Error(`Unexpected ${url}`);
  });
  return {
    entries,
    dependencies: {apiClient: createLiferayApiClient({fetchImpl}), tokenClient: createStaticTokenClient()},
  };
}

async function writeMap(name: string, content: string): Promise<string> {
  const file = path.join(createTempDir('ldev-redirects-'), name);
  await fs.writeFile(file, content);
  return file;
}

describe('redirect map', () => {
  test('reads CSV with an optional header and JSON, normalising sources and defaulting to 301', async () => {
    const csv = await writeMap('map.csv', 'source,destination,permanent\n/old/a,/web/b/a\n"/old/b",/web/b/b,302\n');
    const json = await writeMap(
      'map.json',
      JSON.stringify([{sourceURL: '//old/c', destinationURL: '/web/b/c', permanent: false}]),
    );

    expect(await readRedirectMap(csv)).toEqual([
      {sourceURL: 'old/a', destinationURL: '/web/b/a', permanent: true},
      {sourceURL: 'old/b', destinationURL: '/web/b/b', permanent: false},
    ]);
    expect(await readRedirectMap(json)).toEqual([{sourceURL: 'old/c', destinationURL: '/web/b/c', permanent: false}]);
  });

  test('rejects duplicate sources, empty destinations and self-redirects before calling the portal', async () => {
    const file = await writeMap('map.csv', '/old/a,/web/b/a\n/old/a,/web/b/x\n/old/c,\n/loop,/web/b/loop\n');
    const portal = createRedirectPortal([]);

    await expect(
      runLiferayRedirectsImport(CONFIG, {site: '/facultat-b', file, checkOnly: true}, portal.dependencies),
    ).rejects.toThrow(/duplicate source \/old\/a; empty source or destination.*; \/loop redirects to itself/);
  });
});

describe('ldev resource import-redirects', () => {
  test('plans create/update/unchanged by source URL and keeps remote-only entries', async () => {
    const file = await writeMap('map.csv', '/old/a,/web/b/a\n/old/b,/web/b/new\n/old/c,/web/b/c\n');
    const portal = createRedirectPortal([
      {redirectEntryId: 1, sourceURL: 'old/b', destinationURL: '/web/b/old', permanent: true},
      {redirectEntryId: 2, sourceURL: 'old/c', destinationURL: '/web/b/c', permanent: true},
      {redirectEntryId: 3, sourceURL: 'legacy', destinationURL: '/web/b/legacy', permanent: true},
    ]);

    const checked = await runLiferayRedirectsImport(
      CONFIG,
      {site: '/facultat-b', file, checkOnly: true},
      portal.dependencies,
    );
    expect(checked).toMatchObject({create: ['old/a'], update: ['old/b'], unchanged: ['old/c'], remoteOnly: ['legacy']});
    expect(portal.entries).toHaveLength(3);

    const applied = await runLiferayRedirectsImport(CONFIG, {site: '/facultat-b', file}, portal.dependencies);
    expect(applied.status).toBe('applied');
    expect(portal.entries.map((entry) => [entry.sourceURL, entry.destinationURL])).toEqual([
      ['old/b', '/web/b/new'],
      ['old/c', '/web/b/c'],
      ['legacy', '/web/b/legacy'],
      ['old/a', '/web/b/a'],
    ]);
  });

  test('surfaces JSONWS exceptions returned with HTTP 200', async () => {
    const file = await writeMap('map.csv', '/old/a,/web/b/a\n');
    const portal = createRedirectPortal([], {failAdd: true});

    await expect(runLiferayRedirectsImport(CONFIG, {site: '/facultat-b', file}, portal.dependencies)).rejects.toThrow(
      /DuplicateRedirectEntrySourceURLException/,
    );
  });

  test('fails the read-back when the portal did not store the change', async () => {
    const file = await writeMap('map.csv', '/old/b,/web/b/new\n');
    const portal = createRedirectPortal(
      [{redirectEntryId: 1, sourceURL: 'old/b', destinationURL: '/web/b/old', permanent: true}],
      {ignoreUpdates: true},
    );

    await expect(runLiferayRedirectsImport(CONFIG, {site: '/facultat-b', file}, portal.dependencies)).rejects.toThrow(
      /Read-back mismatch for redirects: old\/b/,
    );
  });

  test('--probe expects 301 for permanent redirects pointing at the destination', async () => {
    const file = await writeMap('map.csv', '/old/a,/web/b/a\n/old/b,/web/b/b\n');
    const portal = createRedirectPortal([]);
    const probed: string[] = [];
    const fetchProbe = ((url: string) => {
      probed.push(url);
      return Promise.resolve(
        url.endsWith('/old/a')
          ? new Response(null, {status: 301, headers: {location: 'http://localhost:8080/web/b/a'}})
          : new Response(null, {status: 404}),
      );
    }) as typeof fetch;

    await expect(
      runLiferayRedirectsImport(
        CONFIG,
        {site: '/facultat-b', file, probe: true},
        {...portal.dependencies, fetch: fetchProbe},
      ),
    ).rejects.toThrow(/not served as expected: \/old\/b -> 404/);
    expect(probed).toEqual([
      'http://localhost:8080/web/facultat-b/old/a',
      'http://localhost:8080/web/facultat-b/old/b',
    ]);
  });
});
