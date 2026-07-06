import {describe, expect, test} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import {createLiferayApiClient} from '../../src/core/http/client.js';
import {CliError} from '../../src/core/errors.js';
import {
  formatLiferayBatchExport,
  formatLiferayBatchImport,
  formatLiferayBatchStatus,
  getLiferayBatchExportExitCode,
  getLiferayBatchImportExitCode,
  getLiferayBatchStatusExitCode,
  runLiferayBatchExport,
  runLiferayBatchImport,
  runLiferayBatchStatus,
} from '../../src/features/liferay/batch/liferay-batch-engine.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';

const CONFIG: AppConfig = {
  cwd: '/tmp/repo',
  repoRoot: '/tmp/repo',
  dockerDir: null,
  liferayDir: null,
  files: {
    dockerEnv: null,
    liferayProfile: null,
  },
  liferay: {
    url: 'http://localhost:8080',
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'client-secret',
    scopeAliases: 'scope-a',
    timeoutSeconds: 30,
  },
};

const TOKEN_CLIENT = createStaticTokenClient({accessToken: 'token-abc'});
const CLASS_NAME = 'com.liferay.object.model.ObjectEntry';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {status});
}

function noopSleep(): Promise<void> {
  return Promise.resolve();
}

function createClock(startMs: number, incrementMs: number): () => number {
  let current = startMs;
  return () => {
    const value = current;
    current += incrementMs;
    return value;
  };
}

type Handler = (url: string, init?: RequestInit) => Response;

function makeApiClient(routes: Array<{match: (url: string, method: string) => boolean; handler: Handler}>) {
  return createLiferayApiClient({
    fetchImpl: createTestFetchImpl((url, init) => {
      const method = init?.method ?? 'GET';
      for (const route of routes) {
        if (route.match(url, method)) {
          return route.handler(url, init);
        }
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    }),
  });
}

describe('runLiferayBatchImport', () => {
  test('submits, polls through INITIAL/STARTED/COMPLETED, and verifies via failed-items read-back', async () => {
    let pollCount = 0;
    const apiClient = makeApiClient([
      {
        match: (url, method) => method === 'POST' && url.includes('/import-tasks/'),
        handler: () => jsonResponse({id: 555, executeStatus: 'INITIAL'}),
      },
      {
        match: (url, method) => method === 'GET' && url.includes('/import-tasks/555/failed-items'),
        handler: () => jsonResponse([]),
      },
      {
        match: (url, method) => method === 'GET' && url.includes('/import-tasks/555'),
        handler: () => {
          pollCount += 1;
          const status = pollCount === 1 ? 'STARTED' : 'COMPLETED';
          return jsonResponse({id: 555, executeStatus: status});
        },
      },
    ]);

    const result = await runLiferayBatchImport(
      CONFIG,
      {className: CLASS_NAME, data: JSON.stringify([{id: 1}, {id: 2}]), pollIntervalSeconds: 0.01},
      {apiClient, tokenClient: TOKEN_CLIENT, sleep: noopSleep},
    );

    expect(result.taskId).toBe(555);
    expect(result.executeStatus).toBe('COMPLETED');
    expect(result.submittedItems).toBe(2);
    expect(result.timedOut).toBe(false);
    expect(result.failedItemsChecked).toBe(true);
    expect(result.failedItems).toEqual([]);
    expect(result.verified).toBe(true);
    expect(getLiferayBatchImportExitCode(result)).toBe(0);

    const text = formatLiferayBatchImport(result);
    expect(text).toContain('COMPLETED');
    expect(text).toContain('verified: read-back');
  });

  test('reports failed items and a non-zero exit code when the task fails', async () => {
    const apiClient = makeApiClient([
      {
        match: (url, method) => method === 'POST' && url.includes('/import-tasks/'),
        handler: () => jsonResponse({id: 777, executeStatus: 'INITIAL'}),
      },
      {
        match: (url, method) => method === 'GET' && url.includes('/import-tasks/777/failed-items'),
        handler: () => jsonResponse([{itemIndex: 0, message: 'Invalid field: name', item: '{"id":1}'}]),
      },
      {
        match: (url, method) => method === 'GET' && url.includes('/import-tasks/777'),
        handler: () => jsonResponse({id: 777, executeStatus: 'FAILED', errorMessage: 'Validation failed'}),
      },
    ]);

    const result = await runLiferayBatchImport(
      CONFIG,
      {className: CLASS_NAME, data: '[{"id":1}]', pollIntervalSeconds: 0.01},
      {apiClient, tokenClient: TOKEN_CLIENT, sleep: noopSleep},
    );

    expect(result.executeStatus).toBe('FAILED');
    expect(result.errorMessage).toBe('Validation failed');
    expect(result.failedItems).toHaveLength(1);
    expect(result.verified).toBe(false);
    expect(getLiferayBatchImportExitCode(result)).toBe(1);

    const text = formatLiferayBatchImport(result);
    expect(text).toContain('failed items (1)');
    expect(text).toContain('Invalid field: name');
  });

  test('reports a timeout when executeStatus never reaches a terminal state', async () => {
    const apiClient = makeApiClient([
      {
        match: (url, method) => method === 'POST' && url.includes('/import-tasks/'),
        handler: () => jsonResponse({id: 888, executeStatus: 'INITIAL'}),
      },
      {
        match: (url, method) => method === 'GET' && url.includes('/import-tasks/888'),
        handler: () => jsonResponse({id: 888, executeStatus: 'STARTED'}),
      },
    ]);

    const result = await runLiferayBatchImport(
      CONFIG,
      {className: CLASS_NAME, data: '[{"id":1}]', pollIntervalSeconds: 1, pollTimeoutSeconds: 2},
      {apiClient, tokenClient: TOKEN_CLIENT, sleep: noopSleep, now: createClock(0, 1500)},
    );

    expect(result.timedOut).toBe(true);
    expect(result.executeStatus).toBe('STARTED');
    expect(result.verified).toBe(false);
    expect(getLiferayBatchImportExitCode(result)).toBe(1);
    expect(formatLiferayBatchImport(result)).toContain('TIMEOUT');
  });

  test('skips polling when --no-poll is requested', async () => {
    const apiClient = makeApiClient([
      {
        match: (url, method) => method === 'POST' && url.includes('/import-tasks/'),
        handler: () => jsonResponse({id: 999, executeStatus: 'INITIAL'}),
      },
    ]);

    const result = await runLiferayBatchImport(
      CONFIG,
      {className: CLASS_NAME, data: '[{"id":1}]', poll: false},
      {apiClient, tokenClient: TOKEN_CLIENT, sleep: noopSleep},
    );

    expect(result.polled).toBe(false);
    expect(result.pollAttempts).toBe(0);
    expect(result.executeStatus).toBe('INITIAL');
    expect(getLiferayBatchImportExitCode(result)).toBe(0);
    expect(formatLiferayBatchImport(result)).toContain('skipped (--no-poll)');
  });

  test('reads the payload from --file when provided', async () => {
    const fs = await import('fs-extra');
    const os = await import('node:os');
    const path = await import('node:path');
    const file = path.join(os.tmpdir(), `batch-import-${Date.now()}.json`);
    await fs.writeJson(file, {items: [{id: 1}, {id: 2}, {id: 3}]});

    try {
      const apiClient = makeApiClient([
        {
          match: (url, method) => method === 'POST' && url.includes('/import-tasks/'),
          handler: () => jsonResponse({id: 111, executeStatus: 'COMPLETED'}),
        },
      ]);

      const result = await runLiferayBatchImport(
        CONFIG,
        {className: CLASS_NAME, file, poll: false},
        {apiClient, tokenClient: TOKEN_CLIENT, sleep: noopSleep},
      );

      expect(result.submittedItems).toBe(3);
    } finally {
      await fs.remove(file);
    }
  });

  test('throws when --file does not exist', async () => {
    const apiClient = makeApiClient([]);

    await expect(
      runLiferayBatchImport(
        CONFIG,
        {className: CLASS_NAME, file: '/definitely/not/a/real/file.json'},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow(CliError);
  });

  test('throws when both --file and --data are given', async () => {
    const apiClient = makeApiClient([]);

    await expect(
      runLiferayBatchImport(
        CONFIG,
        {className: CLASS_NAME, file: 'x.json', data: '[]'},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow(/Use either --file or --data/);
  });

  test('throws when neither --file nor --data are given', async () => {
    const apiClient = makeApiClient([]);

    await expect(
      runLiferayBatchImport(CONFIG, {className: CLASS_NAME}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow(/One of --file or --data is required/);
  });

  test('throws when --data is not valid JSON', async () => {
    const apiClient = makeApiClient([]);

    await expect(
      runLiferayBatchImport(CONFIG, {className: CLASS_NAME, data: 'not-json'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow(/not valid JSON/);
  });

  test('throws when --class-name is empty', async () => {
    const apiClient = makeApiClient([]);

    await expect(
      runLiferayBatchImport(CONFIG, {className: '  ', data: '[]'}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow(/--class-name is required/);
  });

  test('throws when --create-strategy is invalid', async () => {
    const apiClient = makeApiClient([]);

    await expect(
      runLiferayBatchImport(
        CONFIG,
        {className: CLASS_NAME, data: '[]', createStrategy: 'BOGUS'},
        {apiClient, tokenClient: TOKEN_CLIENT},
      ),
    ).rejects.toThrow(/--create-strategy must be one of/);
  });
});

describe('runLiferayBatchExport', () => {
  test('submits without polling by default', async () => {
    const apiClient = makeApiClient([
      {
        match: (url, method) => method === 'POST' && url.includes('/export-tasks/'),
        handler: () => jsonResponse({id: 42, executeStatus: 'INITIAL'}),
      },
    ]);

    const result = await runLiferayBatchExport(
      CONFIG,
      {className: CLASS_NAME},
      {apiClient, tokenClient: TOKEN_CLIENT, sleep: noopSleep},
    );

    expect(result.polled).toBe(false);
    expect(result.taskId).toBe(42);
    expect(result.contentType).toBe('JSON');
    expect(getLiferayBatchExportExitCode(result)).toBe(0);
    expect(formatLiferayBatchExport(result)).toContain('skipped');
  });

  test('polls until COMPLETED and reports the content path', async () => {
    const apiClient = makeApiClient([
      {
        match: (url, method) => method === 'POST' && url.includes('/export-tasks/'),
        handler: () => jsonResponse({id: 43, executeStatus: 'INITIAL'}),
      },
      {
        match: (url, method) => method === 'GET' && url.includes('/export-tasks/43'),
        handler: () => jsonResponse({id: 43, executeStatus: 'COMPLETED'}),
      },
    ]);

    const result = await runLiferayBatchExport(
      CONFIG,
      {className: CLASS_NAME, poll: true, pollIntervalSeconds: 0.01},
      {apiClient, tokenClient: TOKEN_CLIENT, sleep: noopSleep},
    );

    expect(result.polled).toBe(true);
    expect(result.executeStatus).toBe('COMPLETED');
    expect(result.contentPath).toContain('/export-tasks/43/content');
    expect(getLiferayBatchExportExitCode(result)).toBe(0);
    expect(formatLiferayBatchExport(result)).toContain('content:');
  });

  test('throws when --content-type is empty', async () => {
    const apiClient = makeApiClient([]);

    await expect(
      runLiferayBatchExport(CONFIG, {className: CLASS_NAME, contentType: '  '}, {apiClient, tokenClient: TOKEN_CLIENT}),
    ).rejects.toThrow(/--content-type must not be empty/);
  });
});

describe('runLiferayBatchStatus', () => {
  test('fetches import task status and failed items when terminal', async () => {
    const apiClient = makeApiClient([
      {
        match: (url, method) => method === 'GET' && url.includes('/import-tasks/321/failed-items'),
        handler: () => jsonResponse([{message: 'boom'}]),
      },
      {
        match: (url, method) => method === 'GET' && url.includes('/import-tasks/321'),
        handler: () => jsonResponse({id: 321, executeStatus: 'FAILED', errorMessage: 'boom'}),
      },
    ]);

    const result = await runLiferayBatchStatus(CONFIG, {taskId: 321}, {apiClient, tokenClient: TOKEN_CLIENT});

    expect(result.executeStatus).toBe('FAILED');
    expect(result.failedItems).toHaveLength(1);
    expect(getLiferayBatchStatusExitCode(result)).toBe(1);
    expect(formatLiferayBatchStatus(result)).toContain('failed items (1)');
  });

  test('fetches export task status without failed-items lookup', async () => {
    const apiClient = makeApiClient([
      {
        match: (url, method) => method === 'GET' && url.includes('/export-tasks/654'),
        handler: () => jsonResponse({id: 654, executeStatus: 'COMPLETED'}),
      },
    ]);

    const result = await runLiferayBatchStatus(
      CONFIG,
      {taskId: 654, operation: 'export'},
      {apiClient, tokenClient: TOKEN_CLIENT},
    );

    expect(result.executeStatus).toBe('COMPLETED');
    expect(result.contentPath).toContain('/export-tasks/654/content');
    expect(getLiferayBatchStatusExitCode(result)).toBe(0);
  });

  test('throws when --task is not a positive integer', async () => {
    const apiClient = makeApiClient([]);

    await expect(runLiferayBatchStatus(CONFIG, {taskId: 0}, {apiClient, tokenClient: TOKEN_CLIENT})).rejects.toThrow(
      /--task must be a positive integer/,
    );
  });
});
