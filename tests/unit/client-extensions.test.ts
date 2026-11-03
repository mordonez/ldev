import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {
  listWorkspaceClientExtensions,
  parseBundleStates,
  parseClientExtensionLogEvents,
  toBundleSymbolicName,
} from '../../src/core/runtime/client-extensions.js';
import {runDeployClientExtension} from '../../src/features/client-extension/client-extension-deploy.js';
import type {DeployModuleResult} from '../../src/features/deploy/deploy-module.js';
import {parseLogDiagnosis} from '../../src/features/env/env-logs-diagnose.js';
import {createLiferayApiClient} from '../../src/core/http/client.js';
import {createStaticTokenClient, createTestFetchImpl} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

// Log lines captured from DXP 2026.q3.9.
const STARTED =
  '2026-11-03 16:02:45.379 INFO  [fileinstall-directory-watcher][BundleStartStopLogger:66] STARTED ldevtestbatch_7.4.13 [1555]';
const BATCH_OK =
  '2026-11-03 16:02:45.468 INFO  [fileinstall-directory-watcher][BatchEngineUnitProcessorImpl:233] Successfully deployed batch engine file ldevtestbatch_7.4.13 [1555] /META-INF/batch/picklists.batch-engine-data.json';
const BATCH_FAILED = [
  '2026-11-03 16:03:10.683 ERROR [Refresh Thread][BatchEngineBundleTracker:127] Unable to process batch engine units of bundle ldevtestbatch',
  'java.lang.Exception: Unable to deploy batch engine file ldevtestbatch_7.4.13 [1555] /META-INF/batch/picklists.batch-engine-data.json: Name is null for locale English (United States)',
  '\tat com.liferay.batch.engine.internal.unit.BatchEngineUnitProcessorImpl._execute(BatchEngineUnitProcessorImpl.java:221) ~[bundleFile:?]',
].join('\n');

async function createWorkspace(): Promise<string> {
  const liferayDir = path.join(createTempDir('ldev-cx-'), 'liferay');
  const batchDir = path.join(liferayDir, 'client-extensions', 'ldev-test-batch');
  await fs.outputFile(
    path.join(batchDir, 'client-extension.yaml'),
    [
      'assemble:',
      '    - from: batch',
      '      into: batch',
      'ldev-test-batch:',
      '    name: LDEV Test Batch',
      '    type: batch',
      'ldev-test-batch-importer:',
      '    type: oAuthApplicationHeadlessServer',
      '',
    ].join('\n'),
  );
  await fs.outputJson(path.join(batchDir, 'batch', 'picklists.batch-engine-data.json'), {
    configuration: {className: 'com.liferay.headless.admin.list.type.dto.v1_0.ListTypeDefinition'},
    items: [{externalReferenceCode: 'SHAPES', name: 'Shapes'}],
  });
  await fs.outputFile(
    path.join(liferayDir, 'client-extensions', 'ldev-test-css', 'client-extension.yaml'),
    'ldev-test-css:\n    type: globalCSS\n    url: global.css\n',
  );
  return liferayDir;
}

describe('workspace client extensions', () => {
  test('lists projects with entry types, batch files and the bundle symbolic name', async () => {
    const liferayDir = await createWorkspace();

    expect(await listWorkspaceClientExtensions(liferayDir)).toEqual([
      expect.objectContaining({
        project: 'ldev-test-batch',
        bundleSymbolicName: 'ldevtestbatch',
        entries: [
          {id: 'ldev-test-batch', type: 'batch', name: 'LDEV Test Batch'},
          {id: 'ldev-test-batch-importer', type: 'oAuthApplicationHeadlessServer', name: null},
        ],
        batchFiles: [path.join('batch', 'picklists.batch-engine-data.json')],
      }),
      expect.objectContaining({project: 'ldev-test-css', bundleSymbolicName: 'ldevtestcss', batchFiles: []}),
    ]);
    expect(toBundleSymbolicName('ub_site.initializer-2')).toBe('ubsiteinitializer2');
  });

  test('parses gogo lb -s output and client extension log events', () => {
    expect(parseBundleStates('1554|Active     |   15|ldevtestcss (7.4.13)|7.4.13\nnoise').get('ldevtestcss')).toEqual({
      id: 1554,
      state: 'Active',
      symbolicName: 'ldevtestcss',
      version: '7.4.13',
    });

    expect(parseClientExtensionLogEvents([STARTED, BATCH_OK, BATCH_FAILED].join('\n'), 'ldevtestbatch')).toEqual([
      expect.objectContaining({kind: 'started', bundle: 'ldevtestbatch'}),
      expect.objectContaining({kind: 'batch-ok', file: 'batch/picklists.batch-engine-data.json'}),
      expect.objectContaining({kind: 'error', message: 'batch engine units failed'}),
      expect.objectContaining({
        kind: 'batch-failed',
        file: 'batch/picklists.batch-engine-data.json',
        message: 'Name is null for locale English (United States)',
      }),
    ]);
  });

  test('logs diagnose surfaces failed batch client extensions with a reproduction hint', () => {
    const result = parseLogDiagnosis(BATCH_FAILED);

    expect(result.clientExtensionFailures.map((failure) => failure.kind)).toEqual(['error', 'batch-failed']);
    expect(result.exceptions[0].suggestedCauses.join(' ')).toContain('ldev portal batch import');
  });
});

describe('ldev deploy client-extension', () => {
  const deployed = {hotDeployed: true} as DeployModuleResult;
  const config = (liferayDir: string) => ({
    cwd: path.dirname(liferayDir),
    repoRoot: path.dirname(liferayDir),
    dockerDir: path.join(path.dirname(liferayDir), 'docker'),
    liferayDir,
    files: {dockerEnv: null, liferayProfile: null},
    liferay: {
      url: 'http://localhost:8080',
      oauth2ClientId: 'id',
      oauth2ClientSecret: 's',
      scopeAliases: '',
      timeoutSeconds: 5,
    },
  });
  // Read-back of batch items: nothing exists, every lookup is a 404.
  const portal = {
    apiClient: createLiferayApiClient({fetchImpl: createTestFetchImpl(() => new Response('{}', {status: 404}))}),
    tokenClient: createStaticTokenClient(),
  };
  const activeBundle = () => Promise.resolve(parseBundleStates('1555|Active     |   15|ldevtestbatch (7.4.13)|7.4.13'));

  test('waits for the start and the batch outcome, then fails with the batch reason even if the bundle is Active', async () => {
    const liferayDir = await createWorkspace();
    const logs = ['', STARTED, `${STARTED}\n${BATCH_FAILED}`];

    await expect(
      runDeployClientExtension(
        config(liferayDir),
        {name: 'ldev-test-batch'},
        {
          ...portal,
          deployModule: () => Promise.resolve(deployed),
          readLogs: () => Promise.resolve(logs.length > 1 ? (logs.shift() ?? '') : logs[0]),
          readBundleStates: activeBundle,
          sleep: () => Promise.resolve(),
        },
      ),
    ).rejects.toMatchObject({
      code: 'DEPLOY_CLIENT_EXTENSION_FAILED',
      message: expect.stringMatching(/picklists.batch-engine-data.json: Name is null/) as string,
    });
  });

  test('times out when Liferay never starts the bundle', async () => {
    const liferayDir = await createWorkspace();
    let clock = 0;

    await expect(
      runDeployClientExtension(
        config(liferayDir),
        {name: 'ldev-test-css', timeoutSeconds: 5},
        {
          deployModule: () => Promise.resolve(deployed),
          readLogs: () => Promise.resolve(''),
          readBundleStates: activeBundle,
          sleep: () => {
            clock += 2000;
            return Promise.resolve();
          },
          now: () => clock,
        },
      ),
    ).rejects.toMatchObject({code: 'DEPLOY_CLIENT_EXTENSION_TIMEOUT'});
  });

  test('rejects unknown client extensions and lists the available ones', async () => {
    const liferayDir = await createWorkspace();

    await expect(runDeployClientExtension(config(liferayDir), {name: 'nope'})).rejects.toThrow(
      /Available: ldev-test-batch, ldev-test-css/,
    );
  });
});
