import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {resolveProjectInventory} from '../../src/core/config/project-inventory.js';
import {resolveProjectContext} from '../../src/core/config/project-context.js';
import {createTempRepo, createTempWorkspace} from '../../src/testing/temp-repo.js';

const FIXTURE_YAML = `
paths:
  structures: liferay/resources/journal/structures
`;

describe('project-context', () => {
  test('preserves native project detection and env defaults for ldev-native repos', () => {
    const repoRoot = createTempRepo();

    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      [
        'COMPOSE_PROJECT_NAME=labweb',
        'BIND_IP=127.0.0.1',
        'LIFERAY_HTTP_PORT=8081',
        'GOGO_PORT=11312',
        'LIFERAY_IMAGE=liferay/dxp:2026.q1.0-lts',
        `COMPOSE_FILE=${['docker-compose.yml', 'docker-compose.postgres.yml'].join(path.delimiter)}`,
        'ENV_DATA_ROOT=./data/lab',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(repoRoot, '.liferay-cli.yml'), FIXTURE_YAML);
    fs.writeFileSync(path.join(repoRoot, 'liferay', 'gradle.properties'), 'liferay.workspace.product=dxp-2026.q1.0\n');
    fs.mkdirSync(path.join(repoRoot, 'liferay', 'modules', 'search-customization'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay', 'themes', 'admin-theme'), {recursive: true});
    fs.mkdirSync(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'article.json'), '{}\n');

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
    expect(project.inventory.liferay.product).toBe('dxp-2026.q1.0');
    expect(project.inventory.liferay.version).toBe('dxp-2026.q1.0');
    expect(project.inventory.liferay.image).toBe('liferay/dxp:2026.q1.0-lts');
    expect(project.inventory.runtime.services).toEqual(['liferay', 'postgres']);
    expect(project.inventory.runtime.ports.http).toBe('8081');
    expect(project.inventory.runtime.ports.gogo).toBe('11312');
    expect(project.inventory.local.modules).toEqual({count: 1, sample: ['search-customization']});
    expect(project.inventory.local.themes).toEqual({count: 1, sample: ['admin-theme']});
    expect(project.inventory.resources.structures.count).toBe(1);
  });

  test('preserves Windows absolute compose paths when COMPOSE_FILE uses Windows delimiters', () => {
    const composeFiles = ['C:\\repo\\docker\\docker-compose.yml', 'C:\\repo\\docker\\docker-compose.postgres.yml'];

    const inventory = resolveProjectInventory({
      repoRoot: 'C:\\repo',
      liferayDir: 'C:\\repo\\liferay',
      dockerDir: null,
      projectType: 'ldev-native',
      dockerEnv: {
        COMPOSE_FILE: composeFiles.join(';'),
      },
      paths: {
        structures: 'liferay/resources/journal/structures',
        templates: 'liferay/resources/journal/templates',
        adts: 'liferay/resources/journal/adts',
        fragments: 'liferay/resources/fragments',
        migrations: 'liferay/resources/migrations',
      },
      workspaceProduct: null,
    });

    expect(inventory.runtime.composeFiles).toEqual(composeFiles);
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

  test('treats partial .worktrees overlays as the effective repo root', () => {
    const repoRoot = createTempRepo();
    fs.writeFileSync(
      path.join(repoRoot, 'docker', '.env'),
      ['COMPOSE_PROJECT_NAME=labweb', 'BIND_IP=127.0.0.1', 'LIFERAY_HTTP_PORT=8080'].join('\n'),
    );
    fs.writeFileSync(path.join(repoRoot, '.liferay-cli.yml'), 'paths:\n  fragments: liferay/ub-fragments\n');

    const worktreeRoot = path.join(repoRoot, '.worktrees', 'issue-5');
    fs.mkdirSync(path.join(worktreeRoot, 'liferay', 'resources'), {recursive: true});
    fs.writeFileSync(
      path.join(worktreeRoot, '.liferay-cli.local.yml'),
      'liferay:\n  oauth2:\n    clientId: local-id\n    clientSecret: local-secret\n',
    );

    const project = resolveProjectContext({cwd: path.join(worktreeRoot, 'liferay', 'resources')});

    expect(project.repo.root).toBe(worktreeRoot);
    expect(project.repo.dockerDir).toBe(path.join(worktreeRoot, 'docker'));
    expect(project.repo.liferayDir).toBe(path.join(worktreeRoot, 'liferay'));
    expect(project.files.dockerEnv).toBeNull();
    expect(project.files.liferayProfile).toBe(path.join(repoRoot, '.liferay-cli.yml'));
    expect(project.files.liferayLocalProfile).toBe(path.join(worktreeRoot, '.liferay-cli.local.yml'));
    expect(project.env.composeProjectName).toBe('labweb-issue-5');
    expect(project.env.httpPort).toBe('8239');
    expect(project.env.portalUrl).toBe('http://127.0.0.1:8239');
    expect(project.liferay.url).toBe('http://127.0.0.1:8239');
    expect(project.paths.fragments).toBe('liferay/ub-fragments');
    expect(project.liferay.oauth2Configured).toBe(true);
  });
});
