import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, test, vi} from 'vitest';

import {BladeWorkspaceRuntimeAdapter} from '../../src/core/runtime/blade-workspace-runtime-adapter.js';

describe('BladeWorkspaceRuntimeAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('copies the activation key into bundles/deploy before start', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-workspace-adapter-'));
    const bundlesDeployDir = path.join(workspaceRoot, 'bundles', 'deploy');
    const configDeployDir = path.join(workspaceRoot, 'configs', 'local', 'deploy');
    fs.mkdirSync(bundlesDeployDir, {recursive: true});
    fs.mkdirSync(configDeployDir, {recursive: true});

    const activationKeyFile = path.join(workspaceRoot, 'activation-key-test.xml');
    fs.writeFileSync(activationKeyFile, '<activation-key />');

    const runProcess = vi.fn((command: string, args?: string[]) => {
      const normalizedArgs = args ?? [];

      if (command === 'blade' && normalizedArgs[0] === 'version') {
        return Promise.resolve({
          ok: true,
          stdout: 'blade version 8',
          stderr: '',
          command: 'blade version',
          exitCode: 0,
        });
      }

      if (command === 'blade' && normalizedArgs[0] === 'server' && normalizedArgs[1] === 'start') {
        return Promise.resolve({ok: true, stdout: '', stderr: '', command: 'blade server start', exitCode: 0});
      }

      return Promise.reject(new Error(`Unexpected command ${command} ${normalizedArgs.join(' ')}`));
    });

    const adapter = new BladeWorkspaceRuntimeAdapter(
      {
        cwd: workspaceRoot,
        repoRoot: workspaceRoot,
        liferay: {
          url: 'http://localhost:8080',
        },
      } as never,
      {runProcess},
    );

    const result = await adapter.start({wait: false, activationKeyFile});

    const copiedBundleActivationKey = path.join(bundlesDeployDir, 'activation-key-test.xml');
    const copiedConfigActivationKey = path.join(configDeployDir, 'activation-key-test.xml');
    expect(fs.existsSync(copiedBundleActivationKey)).toBe(true);
    expect(fs.existsSync(copiedConfigActivationKey)).toBe(true);
    expect(result.activationKeyFile).toBe(copiedConfigActivationKey);
  });
});
