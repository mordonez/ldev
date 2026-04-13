import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {formatEnvIsHealthy, type EnvHealthResult} from '../../src/features/env/env-is-healthy.js';
import {formatEnvLogsDiagnose, type EnvLogsDiagnoseResult} from '../../src/features/env/env-logs-diagnose.js';
import {formatEnvStatus} from '../../src/features/env/env-status.js';
import {formatEnvStart, type EnvStartResult} from '../../src/features/env/env-start.js';
import {formatEnvStop, type EnvStopResult} from '../../src/features/env/env-stop.js';
import {formatEnvRestart, type EnvRestartResult} from '../../src/features/env/env-restart.js';
import {formatEnvRecreate, type EnvRecreateResult} from '../../src/features/env/env-recreate.js';
import {formatEnvClean, type EnvCleanResult} from '../../src/features/env/env-clean.js';
import {formatEnvDiff, type EnvDiffResult} from '../../src/features/env/env-diff.js';
import {formatEnvRestore, type EnvRestoreResult} from '../../src/features/env/env-restore.js';
import {formatEnvInit, type EnvInitResult} from '../../src/features/env/env-init.js';
import {formatEnvWait} from '../../src/features/env/env-wait.js';
import {formatEnvSetup, type EnvSetupResult} from '../../src/features/env/env-setup.js';
import type {EnvStatusReport} from '../../src/features/env/env-health.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeStatusReport(overrides?: Partial<EnvStatusReport>): EnvStatusReport {
  return {
    ok: true,
    repoRoot: '/repo',
    dockerDir: '/repo/docker',
    dockerEnvFile: '/repo/docker/.env',
    composeProjectName: 'demo',
    portalUrl: 'http://localhost:8080',
    portalReachable: true,
    services: [],
    liferay: {service: 'liferay', state: 'running', health: 'healthy', containerId: 'abc123'},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatEnvIsHealthy
// ---------------------------------------------------------------------------

describe('formatEnvIsHealthy', () => {
  test('formats all fields as key=value lines', () => {
    const result: EnvHealthResult = {
      ok: true,
      healthy: true,
      portalUrl: 'http://localhost:8080',
      portalReachable: true,
      liferayState: 'running',
      liferayHealth: 'healthy',
    };

    const output = formatEnvIsHealthy(result);

    expect(output).toContain('healthy=true');
    expect(output).toContain('portalUrl=http://localhost:8080');
    expect(output).toContain('portalReachable=true');
    expect(output).toContain('liferayState=running');
    expect(output).toContain('liferayHealth=healthy');
  });

  test('shows unknown and n/a when liferay state and health are null', () => {
    const result: EnvHealthResult = {
      ok: false,
      healthy: false,
      portalUrl: 'http://localhost:8080',
      portalReachable: false,
      liferayState: null,
      liferayHealth: null,
    };

    const output = formatEnvIsHealthy(result);

    expect(output).toContain('healthy=false');
    expect(output).toContain('liferayState=unknown');
    expect(output).toContain('liferayHealth=n/a');
  });
});

// ---------------------------------------------------------------------------
// formatEnvLogsDiagnose
// ---------------------------------------------------------------------------

describe('formatEnvLogsDiagnose', () => {
  test('includes header fields and exception summary', () => {
    const result: EnvLogsDiagnoseResult = {
      ok: true,
      service: 'liferay',
      since: '10m',
      warnings: 3,
      linesAnalyzed: 200,
      exceptions: [
        {
          class: 'com.liferay.portal.kernel.exception.PortalException',
          count: 2,
          firstSeen: '2026-01-01T10:00:00Z',
          lastSeen: '2026-01-01T10:05:00Z',
          stackTrace: 'PortalException: ...',
          suggestedCauses: ['Check permissions'],
        },
      ],
    };

    const output = formatEnvLogsDiagnose(result);

    expect(output).toContain('LOG_DIAGNOSE');
    expect(output).toContain('service=liferay');
    expect(output).toContain('since=10m');
    expect(output).toContain('linesAnalyzed=200');
    expect(output).toContain('warnings=3');
    expect(output).toContain('exceptions=1');
    expect(output).toContain('PortalException');
    expect(output).toContain('count=2');
  });

  test('uses all and all for null service and since', () => {
    const result: EnvLogsDiagnoseResult = {
      ok: true,
      service: null,
      since: null,
      warnings: 0,
      linesAnalyzed: 0,
      exceptions: [],
    };

    const output = formatEnvLogsDiagnose(result);

    expect(output).toContain('service=all');
    expect(output).toContain('since=all');
  });
});

// ---------------------------------------------------------------------------
// formatEnvStatus
// ---------------------------------------------------------------------------

describe('formatEnvStatus', () => {
  test('includes project, docker dir, portal url and liferay state', () => {
    const output = formatEnvStatus(makeStatusReport());

    expect(output).toContain('/repo');
    expect(output).toContain('/repo/docker');
    expect(output).toContain('http://localhost:8080');
    expect(output).toContain('running');
    expect(output).toContain('healthy');
  });

  test('shows not-created when liferay state is null', () => {
    const output = formatEnvStatus(
      makeStatusReport({liferay: {service: 'liferay', state: null, health: null, containerId: null}}),
    );

    expect(output).toContain('not-created');
    expect(output).toContain('n/a');
  });

  test('throws when liferay service is absent from report', () => {
    expect(() => formatEnvStatus(makeStatusReport({liferay: null}))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// formatEnvStart
// ---------------------------------------------------------------------------

describe('formatEnvStart', () => {
  test('includes dockerDir, portalUrl, activationKey and health wait flag', () => {
    const result: EnvStartResult = {
      ok: true,
      dockerDir: '/repo/docker',
      portalUrl: 'http://localhost:8080',
      waitedForHealth: true,
      activationKeyFile: '/repo/activation.xml',
    };

    const output = formatEnvStart(result);

    expect(output).toContain('/repo/docker');
    expect(output).toContain('http://localhost:8080');
    expect(output).toContain('/repo/activation.xml');
    expect(output).toContain('yes');
  });

  test('shows "unchanged" when activationKeyFile is null', () => {
    const result: EnvStartResult = {
      ok: true,
      dockerDir: '/repo/docker',
      portalUrl: 'http://localhost:8080',
      waitedForHealth: false,
      activationKeyFile: null,
    };

    expect(formatEnvStart(result)).toContain('unchanged');
  });
});

// ---------------------------------------------------------------------------
// formatEnvStop
// ---------------------------------------------------------------------------

describe('formatEnvStop', () => {
  test('includes dockerDir in the output', () => {
    const result: EnvStopResult = {ok: true, dockerDir: '/repo/docker', stopped: true};

    expect(formatEnvStop(result)).toContain('/repo/docker');
  });
});

// ---------------------------------------------------------------------------
// formatEnvRestart
// ---------------------------------------------------------------------------

describe('formatEnvRestart', () => {
  test('includes portalUrl and health wait flag', () => {
    const result: EnvRestartResult = {ok: true, portalUrl: 'http://localhost:8080', waitedForHealth: true};
    const output = formatEnvRestart(result);

    expect(output).toContain('http://localhost:8080');
    expect(output).toContain('yes');
  });

  test('shows no when not waiting for health', () => {
    const result: EnvRestartResult = {ok: true, portalUrl: 'http://localhost:8080', waitedForHealth: false};

    expect(formatEnvRestart(result)).toContain('no');
  });
});

// ---------------------------------------------------------------------------
// formatEnvRecreate
// ---------------------------------------------------------------------------

describe('formatEnvRecreate', () => {
  test('includes portalUrl, health wait and artifacts restored count', () => {
    const result: EnvRecreateResult = {
      ok: true,
      portalUrl: 'http://localhost:8080',
      waitedForHealth: true,
      restoredDeployArtifacts: 4,
    };
    const output = formatEnvRecreate(result);

    expect(output).toContain('http://localhost:8080');
    expect(output).toContain('yes');
    expect(output).toContain('4');
  });
});

// ---------------------------------------------------------------------------
// formatEnvClean
// ---------------------------------------------------------------------------

describe('formatEnvClean', () => {
  test('shows yes/no for dataRootDeleted and doclibVolumeRemoved', () => {
    const result: EnvCleanResult = {
      ok: true,
      dockerDir: '/repo/docker',
      composeProjectName: 'demo',
      dataRootDeleted: true,
      dataRootSkipped: null,
      doclibVolumeRemoved: false,
    };
    const output = formatEnvClean(result);

    expect(output).toContain('demo');
    expect(output).toContain('Data root deleted: yes');
    expect(output).toContain('Doclib volume removed: no');
  });

  test('includes skipped data root path when present', () => {
    const result: EnvCleanResult = {
      ok: true,
      dockerDir: '/repo/docker',
      composeProjectName: 'demo',
      dataRootDeleted: false,
      dataRootSkipped: '/external/data',
      doclibVolumeRemoved: false,
    };

    expect(formatEnvClean(result)).toContain('/external/data');
  });
});

// ---------------------------------------------------------------------------
// formatEnvDiff + resolveBaselineFile
// ---------------------------------------------------------------------------

describe('formatEnvDiff', () => {
  test('shows baseline-written message in baseline-written mode', () => {
    const result: EnvDiffResult = {
      ok: true,
      baselineFile: '/repo/.ldev/env-baseline.json',
      mode: 'baseline-written',
      baselineCapturedAt: '2026-01-01T00:00:00Z',
      currentCapturedAt: '2026-01-01T00:00:00Z',
      summary: {addedModules: [], removedModules: [], changedServices: [], resolvedBundles: []},
    };

    const output = formatEnvDiff(result);

    expect(output).toContain('/repo/.ldev/env-baseline.json');
    expect(output).toContain('2026-01-01T00:00:00Z');
  });

  test('shows diff summary counts in diff mode', () => {
    const result: EnvDiffResult = {
      ok: true,
      baselineFile: '/repo/.ldev/env-baseline.json',
      mode: 'diff',
      baselineCapturedAt: '2026-01-01T00:00:00Z',
      currentCapturedAt: '2026-01-02T00:00:00Z',
      summary: {
        addedModules: ['mod-a', 'mod-b'],
        removedModules: ['mod-c'],
        changedServices: [],
        resolvedBundles: ['bundle-x'],
      },
    };

    const output = formatEnvDiff(result);

    expect(output).toContain('Added modules: 2');
    expect(output).toContain('Removed modules: 1');
    expect(output).toContain('Resolved bundles: 1');
  });
});

// ---------------------------------------------------------------------------
// formatEnvRestore
// ---------------------------------------------------------------------------

describe('formatEnvRestore', () => {
  test('includes source, target, restored subdirs and artifact count', () => {
    const result: EnvRestoreResult = {
      ok: true,
      sourceDataRoot: '/main/data',
      targetDataRoot: '/worktree/data',
      restoredSubdirs: ['postgres-data', 'liferay-data'],
      preservedDeployCache: true,
      restoredDeployArtifacts: 3,
    };
    const output = formatEnvRestore(result);

    expect(output).toContain('/main/data');
    expect(output).toContain('/worktree/data');
    expect(output).toContain('postgres-data, liferay-data');
    expect(output).toContain('yes');
    expect(output).toContain('3');
  });

  test('shows "none" when no subdirs were restored', () => {
    const result: EnvRestoreResult = {
      ok: true,
      sourceDataRoot: '/main/data',
      targetDataRoot: '/worktree/data',
      restoredSubdirs: [],
      preservedDeployCache: false,
      restoredDeployArtifacts: 0,
    };

    expect(formatEnvRestore(result)).toContain('none');
  });
});

// ---------------------------------------------------------------------------
// formatEnvInit
// ---------------------------------------------------------------------------

describe('formatEnvInit', () => {
  test('includes docker env file path', () => {
    const result: EnvInitResult = {
      ok: true,
      dockerEnvFile: '/repo/docker/.env',
      created: false,
      mergedKeys: [],
    };

    expect(formatEnvInit(result)).toContain('/repo/docker/.env');
  });

  test('mentions created and merged keys when applicable', () => {
    const result: EnvInitResult = {
      ok: true,
      dockerEnvFile: '/repo/docker/.env',
      created: true,
      mergedKeys: ['BIND_IP', 'LIFERAY_HTTP_PORT'],
    };
    const output = formatEnvInit(result);

    expect(output).toContain('Created');
    expect(output).toContain('BIND_IP');
    expect(output).toContain('LIFERAY_HTTP_PORT');
  });
});

// ---------------------------------------------------------------------------
// formatEnvWait
// ---------------------------------------------------------------------------

describe('formatEnvWait', () => {
  test('includes portalUrl and liferay state from the status report', () => {
    const output = formatEnvWait(makeStatusReport());

    expect(output).toContain('http://localhost:8080');
    expect(output).toContain('running');
    expect(output).toContain('healthy');
  });

  test('shows unknown/n/a when liferay service is absent', () => {
    const output = formatEnvWait(makeStatusReport({liferay: null}));

    expect(output).toContain('unknown');
    expect(output).toContain('n/a');
  });
});

// ---------------------------------------------------------------------------
// formatEnvSetup
// ---------------------------------------------------------------------------

describe('formatEnvSetup', () => {
  test('includes dockerEnvFile, dataRoot and pull/cache flags', () => {
    const result: EnvSetupResult = {
      ok: true,
      dockerEnvFile: '/repo/docker/.env',
      dataRoot: '/repo/docker/data/default',
      createdDirectories: [],
      pulledImages: true,
      warmedDeployCache: true,
      composeFileWritten: null,
    };
    const output = formatEnvSetup(result);

    expect(output).toContain('/repo/docker/.env');
    expect(output).toContain('/repo/docker/data/default');
    expect(output).toContain('Deploy cache warmed: yes');
    expect(output).toContain('Docker pull: executed');
  });

  test('shows "DXP only" profile label when no compose file written', () => {
    const result: EnvSetupResult = {
      ok: true,
      dockerEnvFile: '/repo/docker/.env',
      dataRoot: '/repo/docker/data/default',
      createdDirectories: [],
      pulledImages: false,
      warmedDeployCache: false,
      composeFileWritten: null,
    };

    expect(formatEnvSetup(result)).toContain('DXP only');
  });

  test('shows saved profile path when compose file was written', () => {
    const result: EnvSetupResult = {
      ok: true,
      dockerEnvFile: '/repo/docker/.env',
      dataRoot: '/repo/docker/data/default',
      createdDirectories: [],
      pulledImages: true,
      warmedDeployCache: false,
      composeFileWritten: ['docker-compose.yml', 'docker-compose.elasticsearch.yml'].join(path.delimiter),
    };

    expect(formatEnvSetup(result)).toContain('Profile saved:');
    expect(formatEnvSetup(result)).toContain('elasticsearch');
  });
});
