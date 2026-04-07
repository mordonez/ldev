import {describe, expect, test, vi} from 'vitest';

import * as capabilitiesModule from '../../src/core/platform/capabilities.js';
import * as docker from '../../src/core/platform/docker.js';
import * as git from '../../src/core/platform/git.js';
import * as process from '../../src/core/platform/process.js';

describe('detectCapabilities', () => {
  test('detects all available tools', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: '',
      stdout: '',
      stderr: '',
      exitCode: 0,
      ok: true,
    });
    vi.spyOn(docker, 'isDockerAvailable').mockResolvedValue(true);
    vi.spyOn(docker, 'isDockerComposeAvailable').mockResolvedValue(true);
    vi.spyOn(git, 'getRepoRoot').mockResolvedValue('/repo');

    const capabilities = await capabilitiesModule.detectCapabilities('/repo');

    expect(capabilities.os).toMatch(/linux|macos|windows/);
    expect(capabilities.hasGit).toBe(true);
    expect(capabilities.hasBlade).toBe(true);
    expect(capabilities.hasDocker).toBe(true);
    expect(capabilities.hasDockerCompose).toBe(true);
    expect(capabilities.hasJava).toBe(true);
    expect(capabilities.hasNode).toBe(true);
    expect(capabilities.hasLcp).toBe(true);
    expect(capabilities.supportsWorktrees).toBe(true);
  });

  test('detects when tools are not available', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: '',
      stdout: '',
      stderr: '',
      exitCode: 1,
      ok: false,
    });
    vi.spyOn(docker, 'isDockerAvailable').mockResolvedValue(false);
    vi.spyOn(docker, 'isDockerComposeAvailable').mockResolvedValue(false);
    vi.spyOn(git, 'getRepoRoot').mockResolvedValue(null);

    const capabilities = await capabilitiesModule.detectCapabilities('/tmp/no-repo');

    expect(capabilities.hasGit).toBe(false);
    expect(capabilities.hasBlade).toBe(false);
    expect(capabilities.hasDocker).toBe(false);
    expect(capabilities.hasDockerCompose).toBe(false);
    expect(capabilities.hasJava).toBe(false);
    expect(capabilities.hasNode).toBe(true); // Always true by design
    expect(capabilities.hasLcp).toBe(false);
    expect(capabilities.supportsWorktrees).toBe(false);
  });

  test('detects worktree support when git and repo root exist', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: '',
      stdout: '',
      stderr: '',
      exitCode: 0,
      ok: true,
    });
    vi.spyOn(docker, 'isDockerAvailable').mockResolvedValue(false);
    vi.spyOn(docker, 'isDockerComposeAvailable').mockResolvedValue(false);
    vi.spyOn(git, 'getRepoRoot').mockResolvedValue('/repo');

    const capabilities = await capabilitiesModule.detectCapabilities('/repo');

    expect(capabilities.supportsWorktrees).toBe(true);
  });

  test('detects btrfs snapshots support on linux only', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: '',
      stdout: '',
      stderr: '',
      exitCode: 1,
      ok: false,
    });
    vi.spyOn(docker, 'isDockerAvailable').mockResolvedValue(false);
    vi.spyOn(docker, 'isDockerComposeAvailable').mockResolvedValue(false);
    vi.spyOn(git, 'getRepoRoot').mockResolvedValue(null);

    const capabilities = await capabilitiesModule.detectCapabilities('/tmp');

    // This will depend on the actual platform running tests
    expect(typeof capabilities.supportsBtrfsSnapshots).toBe('boolean');
  });

  test('has node always available', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: '',
      stdout: '',
      stderr: '',
      exitCode: 1,
      ok: false,
    });
    vi.spyOn(docker, 'isDockerAvailable').mockResolvedValue(false);
    vi.spyOn(docker, 'isDockerComposeAvailable').mockResolvedValue(false);
    vi.spyOn(git, 'getRepoRoot').mockResolvedValue(null);

    const capabilities = await capabilitiesModule.detectCapabilities('/tmp');

    expect(capabilities.hasNode).toBe(true);
  });
});
