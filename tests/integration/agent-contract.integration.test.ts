import fs from 'fs-extra';
import {describe, expect, test} from 'vitest';

import path from 'node:path';

import {runCli, CLI_CWD} from '../../src/testing/cli-entry.js';
import {createLiferayCliRepoFixture, parseTestJson} from '../../src/testing/cli-test-helpers.js';

type AgentContextPayload = {
  ok: boolean;
  contractVersion: number;
  project: Record<string, unknown>;
  paths: Record<string, unknown>;
  runtime: Record<string, unknown>;
  liferay: Record<string, unknown>;
  inventory: Record<string, unknown>;
  ai: Record<string, unknown>;
  platform: Record<string, unknown>;
  commands: Record<string, unknown>;
  issues: Array<Record<string, unknown>>;
};

type AgentBootstrapPayload = {
  ok: boolean;
  intent: string;
  cache: Record<string, unknown> | null;
  context: Record<string, unknown>;
  doctor: Record<string, unknown> | null;
};

describe('agent contract integration', () => {
  test('context --json returns the resolved agent context', async () => {
    const result = await runCli(['context', '--json'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<AgentContextPayload>(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.contractVersion).toBe(2);
    expect(parsed.project).toHaveProperty('root');
    expect(parsed.paths).toHaveProperty('dockerDir');
    expect(parsed.paths).toHaveProperty('resources');
    expect(parsed.runtime).toHaveProperty('composeProjectName');
    expect(parsed.liferay).toHaveProperty('auth');
    expect(parsed.inventory).toHaveProperty('modules');
    expect(parsed.ai).toHaveProperty('manifestPresent');
    expect(parsed.platform).toHaveProperty('tools');
    expect(Array.isArray(parsed.issues)).toBe(true);
  }, 30000);

  test('context --json includes the current command readiness matrix', async () => {
    const result = await runCli(['context', '--json'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<AgentContextPayload>(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.contractVersion).toBe(2);
    expect(parsed.commands).toHaveProperty('start');
    expect(parsed.commands).toHaveProperty('liferay');
  }, 30000);

  test('ai bootstrap develop returns context, doctor and cache metadata', async () => {
    const result = await runCli(['ai', 'bootstrap', '--intent=develop', '--cache=60', '--json'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<AgentBootstrapPayload>(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.intent).toBe('develop');
    expect(parsed.cache).toHaveProperty('requestedTtlSeconds');
    expect(parsed.context).toHaveProperty('project');
    expect(parsed.doctor).toHaveProperty('readiness');
  }, 30000);

  test('ai bootstrap discover stays context-only', async () => {
    const result = await runCli(['ai', 'bootstrap', '--intent=discover', '--json'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<AgentBootstrapPayload>(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.intent).toBe('discover');
    expect(parsed.doctor).toBeNull();
  }, 30000);

  test('top-level --repo-root makes ai bootstrap resolve context from another checkout root', async () => {
    const mainRepoRoot = await createLiferayCliRepoFixture('ldev-ai-bootstrap-main-');
    const worktreeLikeDir = path.join(mainRepoRoot, '.worktrees', 'issue-123');
    await fs.ensureDir(worktreeLikeDir);

    const result = await runCli(['--repo-root', mainRepoRoot, 'ai', 'bootstrap', '--intent=develop', '--json'], {
      cwd: worktreeLikeDir,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<AgentBootstrapPayload>(result.stdout);
    const contextProject = parsed.context.project as {root?: unknown};

    expect(parsed.ok).toBe(true);
    expect(parsed.intent).toBe('develop');
    expect(contextProject.root).toBe(mainRepoRoot);
    expect(parsed.doctor).toHaveProperty('readiness');
  }, 30000);
});
