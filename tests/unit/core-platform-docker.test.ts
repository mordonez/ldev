import {describe, expect, test, vi} from 'vitest';

import {CliError} from '../../src/core/errors.js';
import * as docker from '../../src/core/platform/docker.js';
import * as process from '../../src/core/platform/process.js';

describe('docker platform', () => {
  test('isDockerAvailable returns true when docker version succeeds', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker version --format json',
      stdout: '{"Client":{"Version":"20.10.0"}}',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const available = await docker.isDockerAvailable();

    expect(available).toBe(true);
    expect(process.runProcess).toHaveBeenCalledWith('docker', ['version', '--format', 'json']);
  });

  test('isDockerAvailable returns false when docker is not installed', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker version --format json',
      stdout: '',
      stderr: 'docker: command not found',
      exitCode: 1,
      ok: false,
    });

    const available = await docker.isDockerAvailable();

    expect(available).toBe(false);
  });

  test('isDockerComposeAvailable returns true when docker compose succeeds', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker compose version',
      stdout: 'Docker Compose version 2.0.0',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const available = await docker.isDockerComposeAvailable();

    expect(available).toBe(true);
    expect(process.runProcess).toHaveBeenCalledWith('docker', ['compose', 'version']);
  });

  test('isDockerComposeAvailable returns false when docker compose is not available', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker compose version',
      stdout: '',
      stderr: 'Error: compose is not available',
      exitCode: 1,
      ok: false,
    });

    const available = await docker.isDockerComposeAvailable();

    expect(available).toBe(false);
  });

  test('runDocker executes docker command with args', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker ps',
      stdout: 'container list',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const result = await docker.runDocker(['ps']);

    expect(result.ok).toBe(true);
    expect(process.runProcess).toHaveBeenCalledWith('docker', ['ps'], undefined);
  });

  test('runDocker passes options to runProcess', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker run',
      stdout: '',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const options = {cwd: '/repo', env: {TEST: 'value'}};
    await docker.runDocker(['run'], options);

    expect(process.runProcess).toHaveBeenCalledWith('docker', ['run'], options);
  });

  test('runDockerCompose executes compose command with cwd', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker compose up',
      stdout: '',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    await docker.runDockerCompose('/repo', ['up']);

    expect(process.runProcess).toHaveBeenCalledWith('docker', ['compose', 'up'], {cwd: '/repo'});
  });

  test('runDockerCompose merges options with cwd', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker compose up',
      stdout: '',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const options = {env: {COMPOSE_FILE: 'custom.yml'}};
    await docker.runDockerCompose('/repo', ['up'], options);

    expect(process.runProcess).toHaveBeenCalledWith('docker', ['compose', 'up'], {
      cwd: '/repo',
      env: {COMPOSE_FILE: 'custom.yml'},
    });
  });

  test('runDockerOrThrow throws CliError on failure with stderr message', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker run',
      stdout: '',
      stderr: 'Error: container already exists',
      exitCode: 1,
      ok: false,
    });

    await expect(docker.runDockerOrThrow(['run'])).rejects.toThrow(CliError);
    try {
      await docker.runDockerOrThrow(['run']);
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toContain('Error: container already exists');
      expect((error as CliError).code).toBe('DOCKER_ERROR');
    }
  });

  test('runDockerOrThrow throws CliError with stdout fallback', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker run',
      stdout: 'stdout message',
      stderr: '',
      exitCode: 1,
      ok: false,
    });

    try {
      await docker.runDockerOrThrow(['run']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toContain('stdout message');
    }
  });

  test('runDockerOrThrow throws with command fallback when no output', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker custom-cmd arg1 arg2',
      stdout: '',
      stderr: '',
      exitCode: 1,
      ok: false,
    });

    try {
      await docker.runDockerOrThrow(['custom-cmd', 'arg1', 'arg2']);
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toContain('docker custom-cmd arg1 arg2');
    }
  });

  test('runDockerOrThrow returns result on success', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker ps',
      stdout: 'container list',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const result = await docker.runDockerOrThrow(['ps']);

    expect(result.ok).toBe(true);
  });

  test('runDockerComposeOrThrow throws CliError on failure', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker compose down',
      stdout: '',
      stderr: 'Error: service not found',
      exitCode: 1,
      ok: false,
    });

    try {
      await docker.runDockerComposeOrThrow('/repo', ['down']);
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toContain('Error: service not found');
      expect((error as CliError).code).toBe('DOCKER_COMPOSE_ERROR');
    }
  });

  test('runDockerComposeOrThrow returns result on success', async () => {
    vi.spyOn(process, 'runProcess').mockResolvedValue({
      command: 'docker compose up',
      stdout: 'services started',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const result = await docker.runDockerComposeOrThrow('/repo', ['up']);

    expect(result.ok).toBe(true);
  });
});
