import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {detectProject, detectProjectType} from '../../src/core/config/project-type.js';
import {createTempDir, createTempRepo, createTempWorkspace} from '../../src/testing/temp-repo.js';

describe('project-type', () => {
  test('detects ldev-native from a nested path', () => {
    const repoRoot = createTempRepo();
    const nested = path.join(repoRoot, 'liferay', 'modules');

    fs.mkdirSync(nested, {recursive: true});

    expect(detectProjectType(nested)).toBe('ldev-native');
  });

  test('detects blade-workspace from a nested path', () => {
    const workspaceRoot = createTempWorkspace();
    const nested = path.join(workspaceRoot, 'modules', 'demo-portlet');

    fs.mkdirSync(nested, {recursive: true});

    expect(detectProjectType(nested)).toBe('blade-workspace');
  });

  test('returns unknown when no supported project layout is found', () => {
    const directory = createTempDir();

    expect(detectProjectType(directory)).toBe('unknown');
  });

  test('detectProject returns the correct root directory', () => {
    const repoRoot = createTempRepo();
    const nested = path.join(repoRoot, 'liferay', 'modules');

    fs.mkdirSync(nested, {recursive: true});

    const result = detectProject(nested);

    expect(result.type).toBe('ldev-native');
    expect(result.root).toBe(repoRoot);
  });
});

describe('project-type precedence: ldev-native inside blade-workspace', () => {
  // Precedence rule: when starting from inside an ldev-native project, ldev-native wins
  // even if an ancestor directory is also a valid blade-workspace.
  // Starting from the blade-workspace root itself returns blade-workspace.

  test('ldev-native wins when starting from inside the native subdirectory', () => {
    // Layout: /workspace/ (blade-workspace) contains /workspace/liferay/ (ldev-native)
    const workspaceRoot = createTempWorkspace();

    // Plant an ldev-native project inside the workspace
    const nativeRoot = path.join(workspaceRoot, 'liferay');
    fs.mkdirSync(path.join(nativeRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(nativeRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(nativeRoot, 'docker', 'docker-compose.yml'), 'services:\n');

    const nestedInNative = path.join(nativeRoot, 'modules', 'my-portlet');
    fs.mkdirSync(nestedInNative, {recursive: true});

    expect(detectProjectType(nestedInNative)).toBe('ldev-native');
  });

  test('detectProject root points at the native root, not the outer workspace', () => {
    const workspaceRoot = createTempWorkspace();

    const nativeRoot = path.join(workspaceRoot, 'liferay');
    fs.mkdirSync(path.join(nativeRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(nativeRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(nativeRoot, 'docker', 'docker-compose.yml'), 'services:\n');

    const nestedInNative = path.join(nativeRoot, 'modules', 'my-portlet');
    fs.mkdirSync(nestedInNative, {recursive: true});

    const result = detectProject(nestedInNative);

    expect(result.type).toBe('ldev-native');
    expect(result.root).toBe(nativeRoot);
  });

  test('blade-workspace wins when starting from the workspace root even if a native subdirectory exists', () => {
    const workspaceRoot = createTempWorkspace();

    // Plant an ldev-native project inside the workspace (but we start from the workspace root)
    const nativeRoot = path.join(workspaceRoot, 'liferay');
    fs.mkdirSync(path.join(nativeRoot, 'docker'), {recursive: true});
    fs.mkdirSync(path.join(nativeRoot, 'liferay'), {recursive: true});
    fs.writeFileSync(path.join(nativeRoot, 'docker', 'docker-compose.yml'), 'services:\n');

    // Start from workspace root, not from inside the ldev-native subdir
    expect(detectProjectType(workspaceRoot)).toBe('blade-workspace');
  });
});
