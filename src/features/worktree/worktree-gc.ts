import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import {loadConfig} from '../../core/config/load-config.js';
import {isGitRepository, listGitWorktrees} from '../../core/platform/git.js';
import type {Printer} from '../../core/output/printer.js';
import {runDocker} from '../../core/platform/docker.js';
import {runWorktreeClean} from './worktree-clean.js';
import {resolveWorktreeContext} from './worktree-paths.js';

export type WorktreeGcResult = {
  ok: true;
  apply: boolean;
  candidates: string[];
  cleaned: string[];
};

export async function runWorktreeGc(options: {
  cwd: string;
  days?: number;
  apply?: boolean;
  processEnv?: NodeJS.ProcessEnv;
  printer?: Printer;
}): Promise<WorktreeGcResult> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot || !(await isGitRepository(config.repoRoot))) {
    throw new CliError('worktree gc must be run inside a valid git repository.', {
      code: 'WORKTREE_REPO_NOT_FOUND',
    });
  }

  const context = resolveWorktreeContext(config.repoRoot);
  const currentName = context.currentWorktreeName;
  const all = await listGitWorktrees(context.mainRepoRoot);
  const composePrefix = loadComposePrefix(context.mainRepoRoot);
  const runningNames = await listRunningWorktreeNames(composePrefix, options.processEnv);
  const cutoffMs = Date.now() - (options.days ?? 7) * 24 * 60 * 60 * 1000;
  const candidates: string[] = [];

  for (const worktreePath of all) {
    const base = path.basename(worktreePath);
    if (worktreePath === context.mainRepoRoot) {
      continue;
    }
    if (currentName && base === currentName) {
      continue;
    }
    if (runningNames.has(base)) {
      continue;
    }
    const stat = await fs.stat(worktreePath).catch(() => null);
    if (!stat || stat.mtimeMs > cutoffMs) {
      continue;
    }
    candidates.push(base);
  }

  const cleaned: string[] = [];
  if (options.apply ?? false) {
    for (const candidate of candidates) {
      await runWorktreeClean({
        cwd: context.mainRepoRoot,
        name: candidate,
        force: true,
        processEnv: options.processEnv,
        printer: options.printer,
      });
      cleaned.push(candidate);
    }
  }

  return {
    ok: true,
    apply: options.apply ?? false,
    candidates,
    cleaned,
  };
}

export function formatWorktreeGc(result: WorktreeGcResult): string {
  if (result.candidates.length === 0) {
    return 'No worktrees are candidates for cleanup.';
  }
  if (!result.apply) {
    return result.candidates.map((candidate) => `DRY-RUN GC candidate: ${candidate}`).join('\n');
  }
  return result.cleaned.map((candidate) => `GC removed: ${candidate}`).join('\n');
}

function loadComposePrefix(mainRepoRoot: string): string {
  const envFile = path.join(mainRepoRoot, 'docker', '.env');
  if (!fs.existsSync(envFile)) {
    return 'liferay';
  }
  const content = fs.readFileSync(envFile, 'utf8');
  const line = content.split(/\r?\n/).find((item) => item.startsWith('COMPOSE_PROJECT_NAME='));
  return line ? line.slice('COMPOSE_PROJECT_NAME='.length) : 'liferay';
}

async function listRunningWorktreeNames(prefix: string, processEnv?: NodeJS.ProcessEnv): Promise<Set<string>> {
  const result = await runDocker(['ps', '--format', '{{.Names}}'], {env: processEnv, reject: false});
  if (!result.ok) {
    return new Set();
  }
  const names = new Set<string>();
  for (const container of result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')) {
    if (!container.startsWith(`${prefix}-`)) {
      continue;
    }
    const remainder = container.slice(prefix.length + 1);
    const parts = remainder.split('-');
    if (parts.length < 2) {
      continue;
    }
    names.add(parts.slice(0, -1).join('-'));
  }
  return names;
}
