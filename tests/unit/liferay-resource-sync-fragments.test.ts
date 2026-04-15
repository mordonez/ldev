import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  formatLiferayResourceSyncFragments,
  runLiferayResourceSyncFragments,
} from '../../src/features/liferay/resource/liferay-resource-sync-fragments.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const TOKEN_CLIENT = {
  fetchClientCredentialsToken: async () => ({
    accessToken: 'token-123',
    tokenType: 'Bearer',
    expiresIn: 3600,
  }),
};

async function createRepoFixture() {
  const repoRoot = createTempDir('dev-cli-resource-sync-fragments-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay', 'fragments', 'sites', 'global'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'LIFERAY_CLI_URL=http://localhost:8080\n');

  return {
    repoRoot,
    config: {
      cwd: repoRoot,
      repoRoot,
      dockerDir: path.join(repoRoot, 'docker'),
      liferayDir: path.join(repoRoot, 'liferay'),
      files: {
        dockerEnv: path.join(repoRoot, 'docker', '.env'),
        liferayProfile: null,
      },
      liferay: {
        url: 'http://localhost:8080',
        oauth2ClientId: 'client-id',
        oauth2ClientSecret: 'client-secret',
        scopeAliases: 'scope-a',
        timeoutSeconds: 30,
      },
      paths: {
        structures: 'liferay/resources/journal/structures',
        templates: 'liferay/resources/journal/templates',
        adts: 'liferay/resources/templates/application_display',
        fragments: 'liferay/fragments',
      },
    },
  };
}

async function writeFragmentProject(
  projectDir: string,
  options?: {collection?: string; collectionName?: string; fragmentSlug?: string; fragmentName?: string},
) {
  const collection = options?.collection ?? 'marketing';
  const fragmentSlug = options?.fragmentSlug ?? 'hero-banner';
  const collectionDir = path.join(projectDir, 'src', collection);
  const fragmentDir = path.join(collectionDir, 'fragments', fragmentSlug);

  await fs.ensureDir(fragmentDir);
  await fs.writeFile(
    path.join(collectionDir, 'collection.json'),
    JSON.stringify({name: options?.collectionName ?? 'Marketing', description: 'Marketing fragments'}, null, 2),
  );
  await fs.writeFile(path.join(fragmentDir, 'index.html'), '<div>banner</div>');
  await fs.writeFile(path.join(fragmentDir, 'index.css'), '.banner{}');
  await fs.writeFile(path.join(fragmentDir, 'index.js'), 'console.log("banner");');
  await fs.writeFile(path.join(fragmentDir, 'configuration.json'), '{}');
  await fs.writeFile(
    path.join(fragmentDir, 'fragment.json'),
    JSON.stringify(
      {
        configurationPath: 'configuration.json',
        jsPath: 'index.js',
        htmlPath: 'index.html',
        cssPath: 'index.css',
        icon: 'square',
        name: options?.fragmentName ?? 'Hero Banner',
        type: 'section',
      },
      null,
      2,
    ),
  );
}

describe('liferay resource fragments-sync', () => {
  test('imports fragments through the ZIP endpoint when available', async () => {
    const {config, repoRoot} = await createRepoFixture();
    const projectDir = path.join(repoRoot, 'liferay', 'fragments', 'sites', 'global');
    await writeFragmentProject(projectDir);

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/c/portal/fragment/import_fragment_entries')) {
          return new Response(
            '{"fragmentEntriesImportResult":[{"fragmentEntryKey":"hero-banner"}],"pageTemplatesImportResult":[]}',
            {status: 200},
          );
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncFragments(
      config,
      {site: '/global'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('oauth-zip-import');
    if (result.mode !== 'oauth-zip-import') {
      throw new Error('unexpected mode');
    }
    expect(result.summary.importedFragments).toBe(1);
    expect(result.summary.errors).toBe(0);
    expect(result.fragmentResults[0]).toMatchObject({
      collection: 'marketing',
      fragment: 'hero-banner',
      status: 'imported',
    });
  });

  test('updates an existing fragment from a local fragments project', async () => {
    const {config, repoRoot} = await createRepoFixture();
    const projectDir = path.join(repoRoot, 'liferay', 'fragments', 'sites', 'global');
    await writeFragmentProject(projectDir);

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=20121')) {
          return new Response('[{"fragmentCollectionId":501,"fragmentCollectionKey":"marketing","name":"Marketing"}]', {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/update-fragment-collection')) {
          return new Response('{"fragmentCollectionId":501}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=501')) {
          return new Response('[{"fragmentEntryId":601,"fragmentEntryKey":"hero-banner","name":"Hero Banner"}]', {
            status: 200,
          });
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/update-fragment-entry')) {
          const form = new URLSearchParams(String(init?.body ?? ''));
          expect(form.get('fragmentEntryId')).toBe('601');
          expect(form.get('html')).toBe('<div>banner</div>');
          expect(form.get('type')).toBe('1');
          return new Response('{"fragmentEntryId":601}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncFragments(
      config,
      {site: '/global'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('oauth-jsonws-import');
    if (result.mode !== 'oauth-jsonws-import') {
      throw new Error('unexpected mode');
    }
    expect(result.summary.importedFragments).toBe(1);
    expect(result.summary.errors).toBe(0);
    expect(result.fragmentResults[0]).toMatchObject({
      collection: 'marketing',
      fragment: 'hero-banner',
      status: 'imported',
      fragmentEntryId: 601,
    });
    expect(formatLiferayResourceSyncFragments(result)).toBe('imported=1 errors=0');
  });

  test('creates a missing collection and fragment and supports fragment filter', async () => {
    const {config, repoRoot} = await createRepoFixture();
    const projectDir = path.join(repoRoot, 'custom-fragments');
    await writeFragmentProject(projectDir, {collection: 'ub-base', collectionName: 'UB Base'});
    await writeFragmentProject(projectDir, {
      collection: 'ub-base',
      fragmentSlug: 'other-fragment',
      fragmentName: 'Other Fragment',
    });

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=20121')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/add-fragment-collection')) {
          const form = new URLSearchParams(String(init?.body ?? ''));
          expect(form.get('fragmentCollectionKey')).toBe('ub-base');
          return new Response('{"fragmentCollectionId":1100,"fragmentCollectionKey":"ub-base"}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=1100')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/add-fragment-entry')) {
          const form = new URLSearchParams(String(init?.body ?? ''));
          expect(form.get('fragmentEntryKey')).toBe('hero-banner');
          expect(form.get('html')).toBe('<div>banner</div>');
          return new Response('{"fragmentEntryId":3002}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncFragments(
      config,
      {site: '/global', dir: 'custom-fragments', fragment: 'ub-base/fragments/hero-banner'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('oauth-jsonws-import');
    if (result.mode !== 'oauth-jsonws-import') {
      throw new Error('unexpected mode');
    }
    expect(result.summary.importedFragments).toBe(1);
    expect(result.fragmentResults).toHaveLength(1);
    expect(result.fragmentResults[0]?.fragment).toBe('hero-banner');
  });

  test('retries candidates in order when first form fails and second succeeds', async () => {
    const {config, repoRoot} = await createRepoFixture();
    const projectDir = path.join(repoRoot, 'custom-fragments');
    await writeFragmentProject(projectDir, {collection: 'ub-base', collectionName: 'UB Base'});

    let addCollectionCalls = 0;

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input, init) => {
        const url = String(input);

        if (url.includes('/by-friendly-url-path/global')) {
          return new Response('{"id":20121,"friendlyUrlPath":"/global","name":"Global"}', {status: 200});
        }
        if (url.includes('/api/jsonws/group/get-group?groupId=20121')) {
          return new Response('{"companyId":10157}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=20121')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/add-fragment-collection')) {
          addCollectionCalls += 1;
          const form = new URLSearchParams(String(init?.body ?? ''));

          // First candidate includes serviceContext and fails; second candidate omits it and succeeds.
          if (addCollectionCalls === 1) {
            expect(form.get('serviceContext')).toBe('{}');
            return new Response('{"message":"legacy endpoint rejects serviceContext"}', {status: 500});
          }

          expect(addCollectionCalls).toBe(2);
          expect(form.get('serviceContext')).toBeNull();
          return new Response('{"fragmentCollectionId":1100,"fragmentCollectionKey":"ub-base"}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=1100')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/add-fragment-entry')) {
          return new Response('{"fragmentEntryId":3002}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncFragments(
      config,
      {site: '/global', dir: 'custom-fragments', fragment: 'ub-base/fragments/hero-banner'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.mode).toBe('oauth-jsonws-import');
    if (result.mode !== 'oauth-jsonws-import') {
      throw new Error('unexpected mode');
    }
    expect(addCollectionCalls).toBe(2);
    expect(result.summary.importedFragments).toBe(1);
    expect(result.summary.errors).toBe(0);
  });

  test('supports all-sites and skips site projects without src', async () => {
    const {config, repoRoot} = await createRepoFixture();
    await writeFragmentProject(path.join(repoRoot, 'liferay', 'fragments', 'sites', 'global'));
    await fs.ensureDir(path.join(repoRoot, 'liferay', 'fragments', 'sites', 'foo'));

    const apiClient = createLiferayApiClient({
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/api/jsonws/company/get-companies')) {
          return new Response('[{"companyId":10157}]', {status: 200});
        }
        if (url.includes('/api/jsonws/group/search-count?companyId=10157')) {
          return new Response('2', {status: 200});
        }
        if (url.includes('/api/jsonws/group/search?companyId=10157')) {
          return new Response(
            '[{"groupId":20121,"friendlyURL":"/global","nameCurrentValue":"Global","site":true},{"groupId":20122,"friendlyURL":"/foo","nameCurrentValue":"Foo","site":true}]',
            {status: 200},
          );
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/get-fragment-collections?groupId=20121')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmentcollection/add-fragment-collection')) {
          return new Response('{"fragmentCollectionId":501,"fragmentCollectionKey":"marketing"}', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/get-fragment-entries?fragmentCollectionId=501')) {
          return new Response('[]', {status: 200});
        }
        if (url.includes('/api/jsonws/fragment.fragmententry/add-fragment-entry')) {
          return new Response('{"fragmentEntryId":601}', {status: 200});
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    const result = await runLiferayResourceSyncFragments(
      config,
      {allSites: true},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result).toMatchObject({
      mode: 'all-sites',
      sites: 1,
      imported: 1,
      errors: 0,
    });
    expect(formatLiferayResourceSyncFragments(result)).toBe('sites=1 imported=1 errors=0 mode=all-sites');
  });
});
