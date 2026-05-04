import {EventEmitter} from 'node:events';
import type {AddressInfo} from 'node:net';

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

const collectDashboardStatusMock = vi.fn();
const loadConfigMock = vi.fn();
const runDockerMock = vi.fn();
const listGitWorktreeDetailsMock = vi.fn();
const buildComposeEnvMock = vi.fn();
const resolveEnvContextMock = vi.fn();
const collectEnvStatusMock = vi.fn();
const normalizeProcessEnvMock = vi.fn((env: NodeJS.ProcessEnv) => env);
const resolveSpawnCommandMock = vi.fn((command: string) => command);
const spawnPipedProcessMock = vi.fn();
const runEnvStartMock = vi.fn();
const runEnvStopMock = vi.fn();
const runMcpDoctorMock = vi.fn();
const runMcpSetupMock = vi.fn();
const runWorktreeSetupMock = vi.fn();
const runWorktreeEnvMock = vi.fn();
const runDbDownloadMock = vi.fn();
const runDbSyncMock = vi.fn();
const runDbImportMock = vi.fn();
const runDbQueryMock = vi.fn();
const runDoctorMock = vi.fn();
const runDeployStatusMock = vi.fn();
const runDeployCacheUpdateMock = vi.fn();
const runEnvRestartMock = vi.fn();
const runEnvRecreateMock = vi.fn();
const runWorktreeGcMock = vi.fn();
const runResourceExportTemplatesMock = vi.fn();
const runResourceExportStructuresMock = vi.fn();
const runResourceExportAdtsMock = vi.fn();
const runResourceExportFragmentsMock = vi.fn();

vi.mock('../../src/core/config/load-config.js', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('../../src/core/platform/docker.js', () => ({
  runDocker: runDockerMock,
  runDockerCompose: vi.fn(),
}));

vi.mock('../../src/core/platform/process.js', () => {
  return {
    normalizeProcessEnv: normalizeProcessEnvMock,
    resolveSpawnCommand: resolveSpawnCommandMock,
    spawnPipedProcess: spawnPipedProcessMock,
  };
});

vi.mock('../../src/core/platform/git.js', () => ({
  listGitWorktreeDetails: listGitWorktreeDetailsMock,
}));

vi.mock('../../src/core/runtime/env-context.js', () => ({
  buildComposeEnv: buildComposeEnvMock,
  resolveEnvContext: resolveEnvContextMock,
}));

vi.mock('../../src/core/runtime/env-health.js', () => ({
  collectEnvStatus: collectEnvStatusMock,
}));

vi.mock('../../src/features/env/env-start.js', () => ({
  runEnvStart: runEnvStartMock,
}));

vi.mock('../../src/features/env/env-stop.js', () => ({
  runEnvStop: runEnvStopMock,
}));

vi.mock('../../src/features/worktree/worktree-clean.js', () => ({
  runWorktreeClean: vi.fn(),
}));

vi.mock('../../src/features/worktree/worktree-setup.js', () => ({
  runWorktreeSetup: runWorktreeSetupMock,
}));

vi.mock('../../src/features/worktree/worktree-env.js', () => ({
  runWorktreeEnv: runWorktreeEnvMock,
}));

vi.mock('../../src/features/db/db-download.js', () => ({
  formatDbDownload: vi.fn(() => 'db-download OK'),
  runDbDownload: runDbDownloadMock,
}));

vi.mock('../../src/features/db/db-sync.js', () => ({
  formatDbSync: vi.fn(() => 'DB sync OK'),
  runDbSync: runDbSyncMock,
}));

vi.mock('../../src/features/db/db-import.js', () => ({
  formatDbImport: vi.fn(() => 'DB import OK'),
  runDbImport: runDbImportMock,
}));

vi.mock('../../src/features/db/db-query.js', () => ({
  formatDbQuery: vi.fn(() => 'id\n1'),
  runDbQuery: runDbQueryMock,
}));

vi.mock('../../src/features/doctor/doctor.service.js', () => ({
  formatDoctor: vi.fn(() => 'Doctor OK'),
  runDoctor: runDoctorMock,
}));

vi.mock('../../src/features/deploy/deploy-status.js', () => ({
  formatDeployStatus: vi.fn(() => 'Deploy status OK'),
  runDeployStatus: runDeployStatusMock,
}));

vi.mock('../../src/features/deploy/deploy-cache-update.js', () => ({
  formatDeployCacheUpdate: vi.fn(() => 'Deploy cache update OK'),
  runDeployCacheUpdate: runDeployCacheUpdateMock,
}));

vi.mock('../../src/features/env/env-restart.js', () => ({
  formatEnvRestart: vi.fn(() => 'Restart OK'),
  runEnvRestart: runEnvRestartMock,
}));

vi.mock('../../src/features/env/env-recreate.js', () => ({
  formatEnvRecreate: vi.fn(() => 'Recreate OK'),
  runEnvRecreate: runEnvRecreateMock,
}));

vi.mock('../../src/features/worktree/worktree-gc.js', () => ({
  formatWorktreeGc: vi.fn(() => 'GC removed: stale-1'),
  runWorktreeGc: runWorktreeGcMock,
}));

vi.mock('../../src/features/liferay/resource/liferay-resource-export-templates.js', () => ({
  formatLiferayResourceExportTemplates: vi.fn(() => 'templates OK'),
  runLiferayResourceExportTemplates: runResourceExportTemplatesMock,
}));

vi.mock('../../src/features/liferay/resource/liferay-resource-export-structures.js', () => ({
  formatLiferayResourceExportStructures: vi.fn(() => 'structures OK'),
  runLiferayResourceExportStructures: runResourceExportStructuresMock,
}));

vi.mock('../../src/features/liferay/resource/liferay-resource-export-adts.js', () => ({
  formatLiferayResourceExportAdts: vi.fn(() => 'adts OK'),
  runLiferayResourceExportAdts: runResourceExportAdtsMock,
}));

vi.mock('../../src/features/liferay/resource/liferay-resource-export-fragments.js', () => ({
  formatLiferayResourceExportFragments: vi.fn(() => 'fragments OK'),
  runLiferayResourceExportFragments: runResourceExportFragmentsMock,
}));

vi.mock('../../src/features/mcp-server/mcp-server-doctor.js', () => ({
  formatMcpDoctor: vi.fn(() => 'MCP doctor passed'),
  runMcpDoctor: runMcpDoctorMock,
}));

vi.mock('../../src/features/mcp-server/mcp-server-setup.js', () => ({
  formatMcpSetup: vi.fn(() => 'Configured 3 MCP client configs'),
  runMcpSetup: runMcpSetupMock,
}));

vi.mock('../../src/features/dashboard/dashboard-data.js', () => ({
  collectDashboardStatus: collectDashboardStatusMock,
}));

const {createDashboardServer} = await import('../../src/features/dashboard/dashboard-server.js');

type CreateWorktreeOptions = {
  cwd: string;
  name: string;
  baseRef?: string;
  withEnv: boolean;
  stopMainForClone: boolean;
  restartMainAfterClone: boolean;
  stopEnv: unknown;
  startEnv: unknown;
  printer: unknown;
};

type WorktreeEnvOptions = {
  cwd: string;
  printer: unknown;
};

type DbOptions = {
  environment?: string;
  file?: string;
  force?: boolean;
  printer?: unknown;
  processEnv?: NodeJS.ProcessEnv;
  query?: string;
};

type WorktreeGcOptions = {
  cwd: string;
  days: number;
  apply: boolean;
  processEnv: NodeJS.ProcessEnv;
  printer?: unknown;
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('createDashboardServer', () => {
  let server: ReturnType<typeof createDashboardServer> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    collectDashboardStatusMock.mockResolvedValue({
      cwd: '/repo',
      refreshedAt: new Date().toISOString(),
      mcp: {targetDir: '/repo', clients: []},
      worktrees: [],
    });
    listGitWorktreeDetailsMock.mockResolvedValue([]);
  });

  afterEach(async () => {
    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    server = null;
  });

  test('creates a new worktree from the dashboard API with issue-friendly defaults', async () => {
    let resolveTask!: (value: {
      ok: true;
      worktreeName: string;
      worktreeDir: string;
      branch: string;
      reused: boolean;
      envPrepared: boolean;
      mainEnvStoppedForClone: boolean;
      mainEnvRestartedAfterClone: boolean;
    }) => void;
    runWorktreeSetupMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTask = resolve;
        }),
    );

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/worktrees`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'issue-42', baseRef: 'main'}),
    });

    expect(response.status).toBe(202);
    const body = await readJson<{ok: true; taskId: string; worktree: string; action: string}>(response);
    expect(body).toMatchObject({ok: true, worktree: 'issue-42', action: 'create'});

    const taskResponse = await fetch(`http://127.0.0.1:${port}/api/tasks`);
    expect(taskResponse.status).toBe(200);
    const taskPayload = await readJson<{
      tasks: Array<{id: string; label: string; status: string}>;
    }>(taskResponse);
    expect(taskPayload.tasks).toHaveLength(1);
    expect(taskPayload.tasks[0]).toMatchObject({
      id: body.taskId,
      label: 'Creating worktree issue-42',
      status: 'running',
    });

    resolveTask({
      ok: true,
      worktreeName: 'issue-42',
      worktreeDir: '/repo/.worktrees/issue-42',
      branch: 'fix/issue-42',
      reused: false,
      envPrepared: true,
      mainEnvStoppedForClone: true,
      mainEnvRestartedAfterClone: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const completedResponse = await fetch(`http://127.0.0.1:${port}/api/tasks`);
    const completedPayload = await readJson<{
      tasks: Array<{status: string}>;
    }>(completedResponse);
    expect(completedPayload.tasks[0]).toMatchObject({status: 'succeeded'});
    expect(runWorktreeSetupMock).toHaveBeenCalledTimes(1);

    const options = runWorktreeSetupMock.mock.calls[0]?.[0] as CreateWorktreeOptions | undefined;
    expect(options).toBeDefined();
    expect(options).toMatchObject({
      cwd: '/repo',
      name: 'issue-42',
      baseRef: 'main',
      withEnv: true,
      stopMainForClone: true,
      restartMainAfterClone: false,
    });
    expect(options?.stopEnv).toEqual(expect.any(Function));
    expect(options?.startEnv).toEqual(expect.any(Function));
    expect(options?.printer).toEqual(expect.anything());
  });

  test('serves full dashboard status with git and runtime details enabled', async () => {
    collectDashboardStatusMock.mockResolvedValueOnce({
      cwd: '/repo',
      refreshedAt: new Date().toISOString(),
      mcp: {targetDir: '/repo', clients: []},
      worktrees: [],
    });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/status`);

    expect(response.status).toBe(200);
    expect(collectDashboardStatusMock).toHaveBeenCalledWith('/repo', {
      includeGit: true,
      includeRuntimeDetails: true,
    });
  });

  test('sanitizes internal dashboard status errors', async () => {
    collectDashboardStatusMock.mockRejectedValueOnce(new Error('secret stack details'));

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/status`);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({error: 'Could not load dashboard status'});
  });

  test('rejects worktree creation when the name is missing', async () => {
    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/worktrees`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({withEnv: true}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({error: 'Worktree name is required'});
    expect(runWorktreeSetupMock).not.toHaveBeenCalled();
  });

  test('queues MCP doctor from the dashboard API', async () => {
    runMcpDoctorMock.mockResolvedValue({
      ok: true,
      targetDir: '/repo',
      checkedTools: ['claude-code', 'cursor', 'vscode'],
      results: [],
    });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/mcp/doctor`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tool: 'all'}),
    });

    expect(response.status).toBe(202);
    const body = await readJson<{ok: true; taskId: string; action: string; tool: string}>(response);
    expect(body).toMatchObject({ok: true, action: 'mcp-doctor', tool: 'all'});

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runMcpDoctorMock).toHaveBeenCalledWith({
      targetDir: '/repo',
      tool: 'all',
      handshake: true,
      timeoutMs: 10000,
    });

    const taskResponse = await fetch(`http://127.0.0.1:${port}/api/tasks`);
    const taskPayload = await readJson<{
      tasks: Array<{id: string; label: string; status: string}>;
    }>(taskResponse);
    expect(taskPayload.tasks[0]).toMatchObject({
      id: body.taskId,
      label: 'Running MCP doctor (all)',
      status: 'succeeded',
    });
  });

  test('queues MCP setup from the dashboard API', async () => {
    runMcpSetupMock.mockResolvedValue({
      ok: true,
      tool: 'all',
      strategy: 'global',
      results: [],
    });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/mcp/setup`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tool: 'all'}),
    });

    expect(response.status).toBe(202);
    const body = await readJson<{ok: true; taskId: string; action: string; tool: string; strategy: null}>(response);
    expect(body).toMatchObject({ok: true, action: 'mcp-setup', tool: 'all', strategy: null});

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runMcpSetupMock).toHaveBeenCalledWith({targetDir: '/repo', tool: 'all', strategy: undefined});

    const taskResponse = await fetch(`http://127.0.0.1:${port}/api/tasks`);
    const taskPayload = await readJson<{
      tasks: Array<{id: string; label: string; status: string}>;
    }>(taskResponse);
    expect(taskPayload.tasks[0]).toMatchObject({
      id: body.taskId,
      label: 'Running MCP setup (all)',
      status: 'succeeded',
    });
  });

  test('queues worktree env initialization from the dashboard API', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/pw-430', branch: 'fix/pw-430', detached: false, prunable: false},
    ]);
    runWorktreeEnvMock.mockResolvedValue({
      ok: true,
      worktreeName: 'pw-430',
      worktreeDir: '/repo/.worktrees/pw-430',
      dockerDir: '/repo/.worktrees/pw-430/docker',
      envFile: '/repo/.worktrees/pw-430/docker/.env',
      composeProjectName: 'liferay-pw-430',
      portalUrl: 'http://127.0.0.1:8891',
      dataRoot: '/repo/.worktrees/pw-430/docker/data/envs/pw-430',
      ports: {
        httpPort: '8891',
        debugPort: '50091',
        gogoPort: '11391',
        postgresPort: '54391',
        esHttpPort: '9201',
      },
      createdEnvFile: true,
      clonedState: false,
      btrfsEnabled: false,
    });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/env/init`, {
      method: 'POST',
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ok: true, action: 'env-init', worktree: 'pw-430'});
    await new Promise((resolve) => setTimeout(resolve, 0));

    const initOptions = runWorktreeEnvMock.mock.calls[0]?.[0] as WorktreeEnvOptions | undefined;
    expect(initOptions?.cwd).toBe('/repo/.worktrees/pw-430');
    expect(initOptions?.printer).toBeTruthy();
  });

  test('deduplicates repeated start requests for the same worktree while the action is still running', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/testworktree', branch: 'fix/testworktree', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({
      repoRoot: '/repo/.worktrees/testworktree',
      dockerDir: '/repo/.worktrees/testworktree/docker',
      liferayDir: '/repo/.worktrees/testworktree/liferay',
    });

    let resolveStart: (() => void) | undefined;
    runEnvStartMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = () => {
            resolve(undefined);
          };
        }),
    );

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const firstResponse = await fetch(`http://127.0.0.1:${port}/api/worktrees/testworktree/start`, {method: 'POST'});
    expect(firstResponse.status).toBe(202);
    const firstBody = await readJson<{taskId: string; duplicate?: boolean}>(firstResponse);

    const secondResponse = await fetch(`http://127.0.0.1:${port}/api/worktrees/testworktree/start`, {method: 'POST'});
    expect(secondResponse.status).toBe(202);
    await expect(secondResponse.json()).resolves.toMatchObject({taskId: firstBody.taskId, duplicate: true});

    expect(runEnvStartMock).toHaveBeenCalledTimes(1);

    resolveStart?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test('queues guided db actions from the dashboard API', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/pw-430', branch: 'fix/pw-430', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({
      repoRoot: '/repo/.worktrees/pw-430',
      dockerDir: '/repo/.worktrees/pw-430/docker',
      liferayDir: '/repo/.worktrees/pw-430/liferay',
    });
    runDbDownloadMock.mockResolvedValue({ok: true});
    runDbSyncMock.mockResolvedValue({ok: true});
    runDbImportMock.mockResolvedValue({ok: true});
    runDbQueryMock.mockResolvedValue({ok: true});

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const downloadResponse = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/db/download`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({environment: 'prd'}),
    });
    expect(downloadResponse.status).toBe(202);

    const syncResponse = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/db/sync`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({environment: 'uat', force: true}),
    });
    expect(syncResponse.status).toBe(202);

    const importResponse = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/db/import`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({file: 'C:/tmp/db.sql.gz', force: true}),
    });
    expect(importResponse.status).toBe(202);

    const queryResponse = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/db/query`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query: 'select 1'}),
    });
    expect(queryResponse.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runDbDownloadMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({repoRoot: '/repo/.worktrees/pw-430'}),
    );
    const downloadOptions = runDbDownloadMock.mock.calls[0]?.[1] as DbOptions | undefined;
    expect(downloadOptions?.environment).toBe('prd');
    expect(downloadOptions?.printer).toBeTruthy();

    expect(runDbSyncMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({repoRoot: '/repo/.worktrees/pw-430'}));
    const syncOptions = runDbSyncMock.mock.calls[0]?.[1] as DbOptions | undefined;
    expect(syncOptions?.environment).toBe('uat');
    expect(syncOptions?.force).toBe(true);
    expect(syncOptions?.printer).toBeTruthy();

    expect(runDbImportMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({repoRoot: '/repo/.worktrees/pw-430'}));
    const importOptions = runDbImportMock.mock.calls[0]?.[1] as DbOptions | undefined;
    expect(importOptions?.file).toBe('C:/tmp/db.sql.gz');
    expect(importOptions?.force).toBe(true);
    expect(importOptions?.printer).toBeTruthy();

    expect(runDbQueryMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({repoRoot: '/repo/.worktrees/pw-430'}));
    const queryOptions = runDbQueryMock.mock.calls[0]?.[1] as DbOptions | undefined;
    expect(queryOptions?.query).toBe('select 1');
    expect(queryOptions?.processEnv).toBe(process.env);
  });

  test('queues resource exports for a specific worktree environment', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/pw-430', branch: 'fix/pw-430', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({
      repoRoot: '/repo/.worktrees/pw-430',
      dockerDir: '/repo/.worktrees/pw-430/docker',
      liferayDir: '/repo/.worktrees/pw-430/liferay',
    });
    runResourceExportTemplatesMock.mockResolvedValue({
      mode: 'all-sites',
      scannedSites: 2,
      exported: 4,
      failed: 0,
      outputDir: '/tmp/templates',
      siteResults: [],
    });
    runResourceExportStructuresMock.mockResolvedValue({
      mode: 'all-sites',
      checkOnly: false,
      scannedSites: 2,
      processed: 3,
      diffs: 0,
      siteResults: [],
    });
    runResourceExportAdtsMock.mockResolvedValue({
      mode: 'all-sites',
      site: 'all-sites',
      siteToken: 'all-sites',
      exported: 2,
      failed: 0,
      outputDir: '/tmp/adts',
      scannedSites: 2,
      siteResults: [],
    });
    runResourceExportFragmentsMock.mockResolvedValue({
      mode: 'all-sites',
      site: 'all-sites',
      siteToken: 'all-sites',
      collectionCount: 2,
      fragmentCount: 8,
      outputDir: '/tmp/fragments',
      scannedSites: 2,
      siteResults: [],
    });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/resource/export`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({resources: ['templates', 'structures', 'adts', 'fragments']}),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ok: true, worktree: 'pw-430', action: 'resource-export'});

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runResourceExportTemplatesMock).toHaveBeenCalledWith(
      expect.objectContaining({repoRoot: '/repo/.worktrees/pw-430'}),
      {allSites: true},
    );
    expect(runResourceExportStructuresMock).toHaveBeenCalledWith(
      expect.objectContaining({repoRoot: '/repo/.worktrees/pw-430'}),
      {allSites: true},
    );
    expect(runResourceExportAdtsMock).toHaveBeenCalledWith(
      expect.objectContaining({repoRoot: '/repo/.worktrees/pw-430'}),
      {allSites: true},
    );
    expect(runResourceExportFragmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({repoRoot: '/repo/.worktrees/pw-430'}),
      {allSites: true},
    );
  });

  test('queues global and worktree diagnosis from the dashboard API', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/pw-430', branch: 'fix/pw-430', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({repoRoot: '/repo', dockerDir: '/repo/docker', liferayDir: '/repo/liferay'});
    runDoctorMock.mockResolvedValue({ok: true});

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const globalResponse = await fetch(`http://127.0.0.1:${port}/api/doctor`, {method: 'POST'});
    expect(globalResponse.status).toBe(202);

    const worktreeResponse = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/doctor`, {method: 'POST'});
    expect(worktreeResponse.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runDoctorMock).toHaveBeenCalledTimes(2);
  });

  test('returns structured doctor previews from the dashboard API', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/pw-430', branch: 'fix/pw-430', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({repoRoot: '/repo', dockerDir: '/repo/docker', liferayDir: '/repo/liferay'});
    runDoctorMock
      .mockResolvedValueOnce({
        ok: true,
        summary: {failed: 0, warned: 1},
        checks: [],
        readiness: {},
        runtime: null,
        portal: null,
        osgi: null,
      })
      .mockResolvedValueOnce({
        ok: false,
        summary: {failed: 1, warned: 0},
        checks: [],
        readiness: {},
        runtime: null,
        portal: null,
        osgi: null,
      });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const globalResponse = await fetch(`http://127.0.0.1:${port}/api/doctor`);
    expect(globalResponse.status).toBe(200);
    await expect(globalResponse.json()).resolves.toMatchObject({ok: true, summary: {warned: 1}});

    const worktreeResponse = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/doctor`);
    expect(worktreeResponse.status).toBe(200);
    await expect(worktreeResponse.json()).resolves.toMatchObject({ok: false, summary: {failed: 1}});
  });

  test('queues repair and deploy actions from the dashboard API', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/pw-430', branch: 'fix/pw-430', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({
      repoRoot: '/repo/.worktrees/pw-430',
      dockerDir: '/repo/.worktrees/pw-430/docker',
      liferayDir: '/repo/.worktrees/pw-430/liferay',
    });
    runEnvRestartMock.mockResolvedValue({ok: true});
    runEnvRecreateMock.mockResolvedValue({ok: true});
    runDeployStatusMock.mockResolvedValue({ok: true});
    runDeployCacheUpdateMock.mockResolvedValue({ok: true});

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    expect((await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/env/restart`, {method: 'POST'})).status).toBe(
      202,
    );
    expect((await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/env/recreate`, {method: 'POST'})).status).toBe(
      202,
    );
    expect((await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/deploy/status`, {method: 'POST'})).status).toBe(
      202,
    );
    expect(
      (await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/deploy/cache-update`, {method: 'POST'})).status,
    ).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runEnvRestartMock).toHaveBeenCalled();
    expect(runEnvRecreateMock).toHaveBeenCalled();
    expect(runDeployStatusMock).toHaveBeenCalled();
    expect(runDeployCacheUpdateMock).toHaveBeenCalled();
  });

  test('returns structured deploy status preview from the dashboard API', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/pw-430', branch: 'fix/pw-430', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({
      repoRoot: '/repo/.worktrees/pw-430',
      dockerDir: '/repo/.worktrees/pw-430/docker',
      liferayDir: '/repo/.worktrees/pw-430/liferay',
    });
    runDeployStatusMock.mockResolvedValue({
      ok: true,
      buildDeployDir: '/repo/.worktrees/pw-430/build/docker/deploy',
      cacheDir: '/repo/.worktrees/pw-430/.ldev/deploy-cache',
      lastDeployCommit: 'abc123',
      lastDeployAt: '2026-05-03T01:00:00.000Z',
      modules: [
        {name: 'foo', artifact: 'foo.jar', state: 'ACTIVE', source: 'build', deployedAt: '2026-05-03T01:00:00.000Z'},
      ],
    });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/worktrees/pw-430/deploy/status`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      lastDeployCommit: 'abc123',
      modules: [{name: 'foo'}],
    });
  });

  test('returns maintenance preview and queues maintenance apply from the dashboard API', async () => {
    runWorktreeGcMock
      .mockResolvedValueOnce({ok: true, apply: false, candidates: ['stale-1', 'stale-2'], cleaned: []})
      .mockResolvedValueOnce({ok: true, apply: true, candidates: ['stale-1'], cleaned: ['stale-1']});

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const previewResponse = await fetch(`http://127.0.0.1:${port}/api/maintenance/worktrees/gc?days=14`);
    expect(previewResponse.status).toBe(200);
    await expect(previewResponse.json()).resolves.toMatchObject({candidates: ['stale-1', 'stale-2']});

    const applyResponse = await fetch(`http://127.0.0.1:${port}/api/maintenance/worktrees/gc`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({days: 14, apply: true}),
    });
    expect(applyResponse.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runWorktreeGcMock).toHaveBeenNthCalledWith(1, {
      cwd: '/repo',
      days: 14,
      apply: false,
      processEnv: process.env,
    });
    const applyOptions = runWorktreeGcMock.mock.calls[1]?.[0] as WorktreeGcOptions | undefined;
    expect(applyOptions?.cwd).toBe('/repo');
    expect(applyOptions?.days).toBe(14);
    expect(applyOptions?.apply).toBe(true);
    expect(applyOptions?.processEnv).toBe(process.env);
    expect(applyOptions?.printer).toBeTruthy();
  });

  test('returns an empty maintenance preview when worktree gc is unavailable for the current checkout', async () => {
    runWorktreeGcMock.mockRejectedValueOnce(new Error('worktree gc must be run inside a valid git repository.'));

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/maintenance/worktrees/gc?days=7`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      apply: false,
      candidates: [],
      cleaned: [],
      unavailable: true,
      message: 'Maintenance preview is unavailable outside a git repository',
    });
  });

  test('queues MCP setup for a specific worktree', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/blueprints-575', branch: 'fix/blueprints-575', detached: false, prunable: false},
    ]);
    runMcpSetupMock.mockResolvedValue({
      ok: true,
      tool: 'all',
      strategy: 'global',
      results: [],
    });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/worktrees/blueprints-575/mcp/setup`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tool: 'all'}),
    });

    expect(response.status).toBe(202);
    const body = await readJson<{ok: true; taskId: string; action: string; tool: string; worktree: string}>(response);
    expect(body).toMatchObject({ok: true, action: 'mcp-setup', tool: 'all', worktree: 'blueprints-575'});

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runMcpSetupMock).toHaveBeenCalledWith({
      targetDir: '/repo/.worktrees/blueprints-575',
      tool: 'all',
      strategy: undefined,
    });

    const taskResponse = await fetch(`http://127.0.0.1:${port}/api/tasks`);
    const taskPayload = await readJson<{
      tasks: Array<{id: string; label: string; status: string; worktreeName: string}>;
    }>(taskResponse);
    expect(taskPayload.tasks[0]).toMatchObject({
      id: body.taskId,
      label: 'Running MCP setup for blueprints-575',
      status: 'succeeded',
      worktreeName: 'blueprints-575',
    });
  });

  test('returns combined docker stdout and stderr logs for a worktree', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/blueprints-575', branch: 'fix/blueprints-575', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({repoRoot: '/repo', dockerDir: '/repo/docker', liferayDir: '/repo/liferay'});
    resolveEnvContextMock.mockReturnValue({dockerDir: '/repo/docker'});
    buildComposeEnvMock.mockReturnValue({});
    collectEnvStatusMock.mockResolvedValue({
      liferay: {containerId: 'container-123', state: 'running'},
    });
    runDockerMock.mockResolvedValue({
      ok: true,
      command: 'docker logs --tail 200 --timestamps container-123',
      stdout: 'stdout-line\n',
      stderr: 'stderr-line\n',
      exitCode: 0,
    });

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/worktrees/blueprints-575/logs`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      containerId: 'container-123',
      running: true,
      logs: 'stdout-line\nstderr-line\n',
    });
  });

  test('streams docker logs as NDJSON events for a worktree', async () => {
    listGitWorktreeDetailsMock.mockResolvedValue([
      {path: '/repo', branch: 'main', detached: false, prunable: false},
      {path: '/repo/.worktrees/blueprints-575', branch: 'fix/blueprints-575', detached: false, prunable: false},
    ]);
    loadConfigMock.mockReturnValue({repoRoot: '/repo', dockerDir: '/repo/docker', liferayDir: '/repo/liferay'});
    resolveEnvContextMock.mockReturnValue({dockerDir: '/repo/docker'});
    buildComposeEnvMock.mockReturnValue({PATH: '/docker/bin'});
    collectEnvStatusMock.mockResolvedValue({
      liferay: {containerId: 'container-123', state: 'running'},
    });

    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn(() => true);
    spawnPipedProcessMock.mockReturnValue(child);

    server = createDashboardServer({cwd: '/repo', port: 0});
    await new Promise<void>((resolve) =>
      server?.once('listening', () => {
        resolve();
      }),
    );
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/worktrees/blueprints-575/logs/stream`);

    await vi.waitFor(() => {
      expect(spawnPipedProcessMock).toHaveBeenCalledTimes(1);
    });

    child.stdout.emit('data', 'stdout-line\n');
    child.stderr.emit('data', 'stderr-line\n');
    child.emit('close', 0, null);

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(body).toContain(
      JSON.stringify({type: 'meta', containerId: 'container-123', running: true, service: 'liferay'}),
    );
    expect(body).toContain(JSON.stringify({type: 'chunk', stream: 'stdout', chunk: 'stdout-line\n'}));
    expect(body).toContain(JSON.stringify({type: 'chunk', stream: 'stderr', chunk: 'stderr-line\n'}));
    expect(body).toContain(JSON.stringify({type: 'end', exitCode: 0, signal: null}));
    expect(resolveSpawnCommandMock).toHaveBeenCalledWith('docker', {PATH: '/docker/bin'});
    expect(normalizeProcessEnvMock).toHaveBeenCalledWith({PATH: '/docker/bin'});
  });
});
