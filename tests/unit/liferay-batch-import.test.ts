import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {CliError} from '../../src/core/errors.js';
import {createLiferayApiClient} from '../../src/core/http/client.js';
import {runLiferayBatchImport} from '../../src/features/liferay/batch/liferay-batch-import.js';
import {readBatchJobFile} from '../../src/features/liferay/batch/liferay-batch-shared.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const LIST_TYPE = 'com.liferay.headless.admin.list.type.dto.v1_0.ListTypeDefinition';
const CONFIG = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: '/repo/docker',
  liferayDir: '/repo/liferay',
  files: {dockerEnv: '/repo/docker/.env', liferayProfile: null},
  liferay: {
    url: 'http://localhost:8080',
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'client-secret',
    scopeAliases: 'scope-a',
    timeoutSeconds: 30,
  },
};

type TaskState = {executeStatus: string; failedItems?: unknown[]; errorMessage?: string; processedItemsCount?: number};

/** Batch Engine fake: the task reports `states` in order on each poll; `existing` ERCs answer the read-back. */
function createBatchServer(options: {states: TaskState[]; existing: string[]; submitStatus?: number}) {
  const calls: string[] = [];
  const states = [...options.states];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

  const fetchImpl = createTestFetchImpl((url, init) => {
    const method = init?.method ?? 'GET';
    const {pathname, search} = new URL(url);
    calls.push(`${method} ${pathname}${search}`);

    if (method === 'POST' && pathname.startsWith('/o/headless-batch-engine/v1.0/import-task/')) {
      return options.submitStatus ? json({status: 'INTERNAL_SERVER_ERROR'}, options.submitStatus) : json({id: 7});
    }
    if (pathname === '/o/headless-batch-engine/v1.0/import-task/7') {
      const state = states.length > 1 ? states.shift() : states[0];
      return json({id: 7, className: LIST_TYPE, totalItemsCount: 2, ...state});
    }
    const byErc = /list-type-definitions\/by-external-reference-code\/(.+)$/.exec(pathname);
    if (byErc) {
      return options.existing.includes(decodeURIComponent(byErc[1])) ? json({id: 1}) : json({}, 404);
    }
    if (/list-type-definitions\/1\/list-type-entries$/.test(pathname)) {
      return json({items: [], lastPage: 1});
    }
    throw new Error(`Unexpected ${method} ${url}`);
  });

  return {
    calls,
    dependencies: {apiClient: createLiferayApiClient({fetchImpl}), tokenClient: createStaticTokenClient()},
  };
}

async function writeJson(name: string, content: unknown): Promise<string> {
  const file = path.join(createTempDir('ldev-batch-'), name);
  await fs.writeJson(file, content);
  return file;
}

const ITEMS = [
  {externalReferenceCode: 'A', name: 'a'},
  {externalReferenceCode: 'B', name: 'b'},
];
const noSleep = () => Promise.resolve();

async function captureError(promise: Promise<unknown>): Promise<CliError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CliError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the promise to reject');
}

describe('batch job file', () => {
  test('reads a batch-engine-data file from a batch client extension', async () => {
    const file = await writeJson('picklists.batch-engine-data.json', {
      configuration: {
        className: LIST_TYPE,
        taskItemDelegateName: 'DEFAULT',
        parameters: {createStrategy: 'INSERT', importStrategy: 'ON_ERROR_CONTINUE', siteId: '20121'},
      },
      items: ITEMS,
    });

    expect(await readBatchJobFile(file, {})).toEqual({
      className: LIST_TYPE,
      taskItemDelegateName: 'DEFAULT',
      createStrategy: 'INSERT',
      importStrategy: 'ON_ERROR_CONTINUE',
      siteId: 20121,
      items: ITEMS,
    });
  });

  test('defaults a plain array to UPSERT + ON_ERROR_FAIL and requires --class-name', async () => {
    const file = await writeJson('items.json', ITEMS);

    await expect(readBatchJobFile(file, {})).rejects.toThrow(/pass --class-name/);
    expect(await readBatchJobFile(file, {className: LIST_TYPE})).toMatchObject({
      createStrategy: 'UPSERT',
      importStrategy: 'ON_ERROR_FAIL',
    });
  });
});

describe('ldev portal batch import', () => {
  test('polls until COMPLETED and reads every item back by ERC', async () => {
    const file = await writeJson('items.json', ITEMS);
    const server = createBatchServer({
      states: [
        {executeStatus: 'INITIAL'},
        {executeStatus: 'STARTED'},
        {executeStatus: 'COMPLETED', processedItemsCount: 2},
      ],
      existing: ['A', 'B'],
    });

    const result = await runLiferayBatchImport(
      CONFIG,
      {file, className: LIST_TYPE, sleep: noSleep},
      server.dependencies,
    );

    expect(result).toMatchObject({
      status: 'completed',
      taskId: 7,
      processedItemsCount: 2,
      readBack: {supported: true, present: ['A', 'B'], missing: []},
    });
    expect(server.calls[0]).toBe(
      `POST /o/headless-batch-engine/v1.0/import-task/${LIST_TYPE}?createStrategy=UPSERT&importStrategy=ON_ERROR_FAIL`,
    );
    expect(server.calls.filter((call) => call.endsWith('/import-task/7'))).toHaveLength(3);
  });

  test('fails on failed items even when the task is COMPLETED, listing what was already written', async () => {
    const file = await writeJson('items.json', ITEMS);
    const server = createBatchServer({
      states: [{executeStatus: 'COMPLETED', failedItems: [{itemIndex: 2, message: 'Name is null', item: '{}'}]}],
      existing: ['A'],
    });

    const error = await captureError(
      runLiferayBatchImport(CONFIG, {file, className: LIST_TYPE, sleep: noSleep}, server.dependencies),
    );

    expect(error.code).toBe('LIFERAY_BATCH_FAILED');
    expect(error.message).toContain('Already written: A');
    expect(error.details).toMatchObject({
      failedItems: [{itemIndex: 2, message: 'Name is null'}],
      readBack: {supported: true, present: ['A'], missing: ['B']},
    });
  });

  test('fails on a FAILED task', async () => {
    const file = await writeJson('items.json', ITEMS);
    const server = createBatchServer({states: [{executeStatus: 'FAILED', errorMessage: 'boom'}], existing: []});

    await expect(
      runLiferayBatchImport(CONFIG, {file, className: LIST_TYPE, sleep: noSleep}, server.dependencies),
    ).rejects.toThrow(/task 7 FAILED: boom/);
  });

  test('times out with the task id when the task never finishes', async () => {
    const file = await writeJson('items.json', ITEMS);
    const server = createBatchServer({states: [{executeStatus: 'STARTED'}], existing: []});

    await expect(
      runLiferayBatchImport(
        CONFIG,
        {file, className: LIST_TYPE, timeoutSeconds: 0, sleep: noSleep},
        server.dependencies,
      ),
    ).rejects.toThrow(/still STARTED.*--task 7/);
  });

  test('check-only reports existing and new items without submitting', async () => {
    const file = await writeJson('items.json', ITEMS);
    const server = createBatchServer({states: [], existing: ['A']});

    const result = await runLiferayBatchImport(
      CONFIG,
      {file, className: LIST_TYPE, checkOnly: true},
      server.dependencies,
    );

    expect(result).toMatchObject({status: 'checked', taskId: null, readBack: {present: ['A'], missing: ['B']}});
    expect(server.calls.some((call) => call.startsWith('POST'))).toBe(false);

    await expect(
      runLiferayBatchImport(
        CONFIG,
        {file, className: LIST_TYPE, createStrategy: 'INSERT', checkOnly: true},
        server.dependencies,
      ),
    ).rejects.toThrow(/INSERT would fail for items that already exist: A/);
  });

  test('explains an unregistered class instead of a bare 500', async () => {
    const file = await writeJson('items.json', ITEMS);
    const server = createBatchServer({states: [], existing: [], submitStatus: 500});

    await expect(
      runLiferayBatchImport(CONFIG, {file, className: 'com.example.Nope', sleep: noSleep}, server.dependencies),
    ).rejects.toThrow(/not a registered batch item/);
  });
});
