import {describe, expect, test} from 'vitest';

import {healthFromStatus} from '../../src/features/env/env-is-healthy.js';

describe('env advanced', () => {
  test('healthFromStatus maps running+no-health and healthy states to healthy', () => {
    expect(
      healthFromStatus({
        ok: true,
        repoRoot: '/repo',
        dockerDir: '/repo/docker',
        dockerEnvFile: '/repo/docker/.env',
        composeProjectName: 'demo',
        portalUrl: 'http://localhost:8080',
        portalReachable: false,
        services: [],
        liferay: {service: 'liferay', state: 'running', health: null, containerId: 'abc'},
      }).healthy,
    ).toBe(true);

    expect(
      healthFromStatus({
        ok: true,
        repoRoot: '/repo',
        dockerDir: '/repo/docker',
        dockerEnvFile: '/repo/docker/.env',
        composeProjectName: 'demo',
        portalUrl: 'http://localhost:8080',
        portalReachable: false,
        services: [],
        liferay: {service: 'liferay', state: 'starting', health: 'starting', containerId: 'abc'},
      }).healthy,
    ).toBe(false);
  });
});
