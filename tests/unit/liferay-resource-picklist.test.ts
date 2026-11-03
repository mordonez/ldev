import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {runLiferayResourceExportPicklist} from '../../src/features/liferay/resource/liferay-resource-export-picklist.js';
import {runLiferayResourceGetPicklist} from '../../src/features/liferay/resource/liferay-resource-get-picklist.js';
import {runLiferayResourceImportPicklist} from '../../src/features/liferay/resource/liferay-resource-import-picklist.js';
import {diffPicklist, normalizePicklist} from '../../src/features/liferay/resource/liferay-resource-picklist-shared.js';
import {createStaticTokenClient, createTestFetchImpl, toTestRequestBody} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const BASE = '/o/headless-admin-list-type/v1.0';

type Entry = Record<string, unknown> & {id: number; key: string};
type Picklist = Record<string, unknown> & {id: number; externalReferenceCode: string; name: string};

function levels(): {picklist: Picklist; entries: Entry[]} {
  return {
    picklist: {
      id: 77,
      externalReferenceCode: 'UB_LEVELS',
      name: 'Levels',
      name_i18n: {en_US: 'Levels'},
      dateCreated: '2026-01-01T00:00:00Z',
      actions: {},
      system: false,
      creator: {id: 20132, name: 'Test Test'},
      status: {code: 0, label: 'approved'},
    },
    entries: [
      {id: 2, key: 'master', name: 'Master', name_i18n: {en_US: 'Master'}, externalReferenceCode: 'UB_LEVEL_MASTER'},
      {id: 1, key: 'degree', name: 'Degree', name_i18n: {en_US: 'Degree'}, externalReferenceCode: 'UB_LEVEL_DEGREE'},
    ],
  };
}

function createFixture() {
  const repoRoot = createTempDir('dev-cli-resource-picklist-');
  return {
    picklistsDir: path.join(repoRoot, 'liferay', 'resources', 'objects', 'picklists'),
    config: {
      cwd: repoRoot,
      repoRoot,
      dockerDir: path.join(repoRoot, 'docker'),
      liferayDir: path.join(repoRoot, 'liferay'),
      files: {dockerEnv: path.join(repoRoot, 'docker', '.env'), liferayProfile: null},
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
        objects: 'liferay/resources/objects',
      },
    },
  };
}

/**
 * In-memory list-type API. With `nestedEntries: false` the definition PUT/POST
 * ignores `listTypeEntries`, so entries only change through their own endpoints.
 */
function createListTypeServer(options: {picklists: {picklist: Picklist; entries: Entry[]}[]; nestedEntries?: boolean}) {
  const picklists = new Map(options.picklists.map((item) => [item.picklist.externalReferenceCode, item]));
  const calls: string[] = [];
  let nextId = 500;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});
  const byId = (id: number) => [...picklists.values()].find((item) => item.picklist.id === id);
  const asEntries = (value: unknown): Entry[] =>
    Array.isArray(value) ? value.map((entry: Record<string, unknown>) => ({...entry, id: nextId++}) as Entry) : [];

  const fetchImpl = createTestFetchImpl((url, init) => {
    const method = init?.method ?? 'GET';
    const {pathname} = new URL(url);
    calls.push(`${method} ${pathname}`);
    const body = (init?.body ? JSON.parse(toTestRequestBody(init.body)) : {}) as Record<string, unknown>;

    const byErc = new RegExp(`^${BASE}/list-type-definitions/by-external-reference-code/(.+)$`).exec(pathname);
    if (byErc) {
      const item = picklists.get(decodeURIComponent(byErc[1]));
      return item ? json(item.picklist) : json({}, 404);
    }
    if (pathname === `${BASE}/list-type-definitions` && method === 'GET') {
      return json({items: [...picklists.values()].map((item) => item.picklist), lastPage: 1});
    }
    if (pathname === `${BASE}/list-type-definitions` && method === 'POST') {
      const {listTypeEntries, ...rest} = body;
      const picklist = {...rest, id: nextId++} as Picklist;
      picklists.set(picklist.externalReferenceCode, {
        picklist,
        entries: options.nestedEntries === false ? [] : asEntries(listTypeEntries),
      });
      return json(picklist);
    }
    const definition = new RegExp(`^${BASE}/list-type-definitions/(\\d+)$`).exec(pathname);
    if (definition && method === 'PUT') {
      const item = byId(Number(definition[1]));
      if (!item) {
        return json({}, 404);
      }
      const {listTypeEntries, ...rest} = body;
      item.picklist = {...rest, id: item.picklist.id} as Picklist;
      if (options.nestedEntries !== false) {
        item.entries = asEntries(listTypeEntries);
      }
      return json(item.picklist);
    }
    const entries = new RegExp(`^${BASE}/list-type-definitions/(\\d+)/list-type-entries$`).exec(pathname);
    if (entries) {
      const item = byId(Number(entries[1]));
      if (method === 'POST' && item) {
        item.entries.push({...body, id: nextId++} as Entry);
        return json(item.entries.at(-1));
      }
      return json({items: item?.entries ?? [], lastPage: 1});
    }
    const entry = new RegExp(`^${BASE}/list-type-entries/(\\d+)$`).exec(pathname);
    if (entry) {
      for (const item of picklists.values()) {
        const index = item.entries.findIndex((candidate) => candidate.id === Number(entry[1]));
        if (index >= 0 && method === 'PUT') {
          item.entries[index] = {...body, id: item.entries[index].id} as Entry;
          return json(item.entries[index]);
        }
        if (index >= 0 && method === 'DELETE') {
          item.entries.splice(index, 1);
          return new Response(null, {status: 204});
        }
      }
      return json({}, 404);
    }

    throw new Error(`Unexpected ${method} ${url}`);
  });

  return {
    calls,
    picklists,
    dependencies: {apiClient: createLiferayApiClient({fetchImpl}), tokenClient: createStaticTokenClient()},
  };
}

async function writeLocal(dir: string, picklist: Record<string, unknown>): Promise<string> {
  const file = path.join(dir, `${String(picklist.externalReferenceCode)}.json`);
  await fs.ensureDir(dir);
  await fs.writeJson(file, picklist, {spaces: 2});
  return file;
}

function localLevels(): Record<string, unknown> {
  const {picklist, entries} = levels();
  return normalizePicklist({...picklist, listTypeEntries: entries});
}

describe('picklist normalization', () => {
  test('drops ids, creator and status, uses BCP 47 locale keys and sorts entries by key', () => {
    expect(localLevels()).toEqual({
      externalReferenceCode: 'UB_LEVELS',
      listTypeEntries: [
        {externalReferenceCode: 'UB_LEVEL_DEGREE', key: 'degree', name: 'Degree', name_i18n: {'en-US': 'Degree'}},
        {externalReferenceCode: 'UB_LEVEL_MASTER', key: 'master', name: 'Master', name_i18n: {'en-US': 'Master'}},
      ],
      name: 'Levels',
      name_i18n: {'en-US': 'Levels'},
    });
  });

  test('diff matches entries by key', () => {
    const {picklist, entries} = levels();
    const local = {
      externalReferenceCode: 'UB_LEVELS',
      listTypeEntries: [
        {key: 'degree', name: 'Grau'},
        {key: 'phd', name: 'PhD'},
      ],
    };

    expect(diffPicklist(local, {...picklist, listTypeEntries: entries})).toEqual([
      {kind: 'change', path: 'listTypeEntries[degree]'},
      {kind: 'add', path: 'listTypeEntries[phd]'},
      {kind: 'remove', path: 'listTypeEntries[master]'},
    ]);
  });
});

describe('liferay resource picklist', () => {
  test('reads by name and exports to paths.objects/picklists/<erc>.json', async () => {
    const {config, picklistsDir} = createFixture();
    const server = createListTypeServer({picklists: [levels()]});

    const result = await runLiferayResourceGetPicklist(config, {id: 'levels'}, server.dependencies);
    expect(result).toMatchObject({id: 77, externalReferenceCode: 'UB_LEVELS', entryKeys: ['degree', 'master']});

    const exported = await runLiferayResourceExportPicklist(config, {id: 'UB_LEVELS'}, server.dependencies);
    expect(exported.outputPath).toBe(path.join(picklistsDir, 'UB_LEVELS.json'));
    expect(await fs.readJson(exported.outputPath)).toEqual(localLevels());
  });

  test('check-only reports changes without writing and guards entry removal', async () => {
    const {config, picklistsDir} = createFixture();
    const server = createListTypeServer({picklists: [levels()]});
    const local = localLevels();
    local.listTypeEntries = [{key: 'degree', name: 'Grau'}];
    await writeLocal(picklistsDir, local);

    await expect(
      runLiferayResourceImportPicklist(config, {key: 'UB_LEVELS', checkOnly: true}, server.dependencies),
    ).rejects.toMatchObject({code: 'LIFERAY_RESOURCE_BREAKING_CHANGE'});

    const result = await runLiferayResourceImportPicklist(
      config,
      {key: 'UB_LEVELS', checkOnly: true, allowBreakingChange: true},
      server.dependencies,
    );
    expect(result.status).toBe('checked');
    expect(result.changes).toEqual([
      {kind: 'change', path: 'listTypeEntries[degree]'},
      {kind: 'remove', path: 'listTypeEntries[master]'},
    ]);
    expect(server.calls.filter((call) => !call.startsWith('GET'))).toEqual([]);
  });

  test.each([true, false])('updates entries and verifies by read-back (nested entries: %s)', async (nestedEntries) => {
    const {config, picklistsDir} = createFixture();
    const server = createListTypeServer({picklists: [levels()], nestedEntries});
    const local = localLevels();
    local.listTypeEntries = [
      {key: 'degree', name: 'Grau', name_i18n: {ca_ES: 'Grau'}},
      {key: 'phd', name: 'Doctorat', name_i18n: {ca_ES: 'Doctorat'}},
    ];
    await writeLocal(picklistsDir, local);

    const result = await runLiferayResourceImportPicklist(
      config,
      {key: 'UB_LEVELS', allowBreakingChange: true},
      server.dependencies,
    );

    expect(result.status).toBe('updated');
    expect(server.picklists.get('UB_LEVELS')?.entries.map((entry) => [entry.key, entry.name])).toEqual([
      ['degree', 'Grau'],
      ['phd', 'Doctorat'],
    ]);
  });

  test('creates a missing picklist with --create-missing', async () => {
    const {config, picklistsDir} = createFixture();
    const server = createListTypeServer({picklists: [], nestedEntries: false});
    const file = await writeLocal(picklistsDir, localLevels());

    const result = await runLiferayResourceImportPicklist(config, {file, createMissing: true}, server.dependencies);

    expect(result).toMatchObject({status: 'created', externalReferenceCode: 'UB_LEVELS'});
    expect(server.picklists.get('UB_LEVELS')?.entries.map((entry) => entry.key)).toEqual(['degree', 'master']);
  });
});
