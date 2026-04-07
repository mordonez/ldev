import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {detectRepoPaths} from '../../src/core/config/repo-paths.js';
import {detectProject} from '../../src/core/config/project-type.js';
import {createTempRepo, createTempWorkspace} from '../../src/testing/temp-repo.js';

describe('repo-paths', () => {
  test('detects repo root from nested path', () => {
    const repoRoot = createTempRepo();
    const nested = path.join(repoRoot, 'liferay', 'modules');
    fs.mkdirSync(nested, {recursive: true});

    const detected = detectRepoPaths(nested);

    expect(detected.repoRoot).toBe(repoRoot);
    expect(detected.dockerDir).toBe(path.join(repoRoot, 'docker'));
    expect(detected.liferayDir).toBe(path.join(repoRoot, 'liferay'));
  });

  test('does not mis-detect a blade workspace as ldev-native', () => {
    const workspaceRoot = createTempWorkspace();
    const nested = path.join(workspaceRoot, 'modules', 'demo-portlet');
    fs.mkdirSync(nested, {recursive: true});

    const detected = detectRepoPaths(nested);

    expect(detected.repoRoot).toBeNull();
    expect(detected.dockerDir).toBeNull();
    expect(detected.liferayDir).toBeNull();
  });

  test('does not mis-detect the liferay/ subdir of an ldev-native repo as blade-workspace', () => {
    const repoRoot = createTempRepo();
    const nested = path.join(repoRoot, 'liferay');

    const detected = detectProject(nested);

    expect(detected.type).toBe('ldev-native');
    expect(detected.root).toBe(repoRoot);
  });
});
