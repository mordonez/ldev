import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {resolveProjectContext} from '../../src/core/config/project-context.js';
import {FIXTURE_YAML} from '../../src/testing/fixtures.js';
import {createTempRepo, createTempWorkspace} from '../../src/testing/temp-repo.js';

describe('project-context', () => {
  test('preserves native project detection and env defaults for ldev-native repos', () => {
    const repoRoot = createTempRepo();

    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      ['COMPOSE_PROJECT_NAME=labweb', 'BIND_IP=127.0.0.1', 'LIFERAY_HTTP_PORT=8081', 'ENV_DATA_ROOT=./data/lab'].join(
        '\n',
      ),
    );
    fs.writeFileSync(path.join(repoRoot, '.liferay-cli.yml'), FIXTURE_YAML);

    const project = resolveProjectContext({cwd: path.join(repoRoot, 'liferay')});

    expect(project.projectType).toBe('ldev-native');
    expect(project.repo.root).toBe(repoRoot);
    expect(project.repo.inRepo).toBe(true);
    expect(project.repo.dockerDir).toBe(path.join(repoRoot, 'docker'));
    expect(project.repo.liferayDir).toBe(path.join(repoRoot, 'liferay'));
    expect(project.env.composeProjectName).toBe('labweb');
    expect(project.env.portalUrl).toBe('http://localhost:8081');
    expect(project.env.dataRoot).toBe(path.join(repoRoot, 'docker', 'data', 'lab'));
    expect(project.workspace.product).toBeNull();
  });

  test('reports blade-workspace as project type without pretending it is an ldev-native repo', () => {
    const workspaceRoot = createTempWorkspace();
    fs.writeFileSync(
      path.join(workspaceRoot, '.liferay-cli.local.yml'),
      'liferay:\n  oauth2:\n    clientId: local-id\n    clientSecret: local-secret\n',
    );
    const project = resolveProjectContext({cwd: path.join(workspaceRoot, 'modules')});

    expect(project.projectType).toBe('blade-workspace');
    expect(project.repo.root).toBe(workspaceRoot);
    expect(project.repo.inRepo).toBe(true);
    expect(project.repo.dockerDir).toBeNull();
    expect(project.repo.liferayDir).toBeNull();
    expect(project.workspace.product).toBe('dxp-2026.q1.0-lts');
    expect(project.files.liferayLocalProfile).toBe(path.join(workspaceRoot, '.liferay-cli.local.yml'));
    expect(project.liferay.oauth2Configured).toBe(true);
  });
});
