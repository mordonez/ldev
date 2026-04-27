import {describe, expect, test} from 'vitest';

import {createRuntimeAdapter, createRuntimeOperations} from '../../src/core/runtime/runtime-adapter-factory.js';
import {loadConfig} from '../../src/core/config/load-config.js';
import {createTempRepo, createTempWorkspace} from '../../src/testing/temp-repo.js';

describe('runtime-adapter-factory', () => {
  test('creates the native runtime adapter for ldev-native projects', () => {
    const repoRoot = createTempRepo();
    const config = loadConfig({cwd: repoRoot, env: {}});

    const adapter = createRuntimeAdapter(config, {projectType: 'ldev-native'});

    expect(adapter.kind).toBe('ldev-native');
  });

  test('creates the workspace runtime adapter for blade-workspace projects', () => {
    const workspaceRoot = createTempWorkspace();
    const config = loadConfig({cwd: workspaceRoot, env: {}});

    const adapter = createRuntimeAdapter(config, {projectType: 'blade-workspace'});

    expect(adapter.kind).toBe('blade-workspace');
  });

  test('creates runtime operations for command callers', () => {
    const repoRoot = createTempRepo();
    const config = loadConfig({cwd: repoRoot, env: {}});

    const operations = createRuntimeOperations(config, {projectType: 'ldev-native'});

    expect(operations.kind).toBe('ldev-native');
    expect(typeof operations.start).toBe('function');
    expect(typeof operations.stop).toBe('function');
    expect(typeof operations.status).toBe('function');
    expect(typeof operations.logs).toBe('function');
  });
});
