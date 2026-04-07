import type {AppConfig} from '../../core/config/load-config.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';

import {ensureEnvFile, resolveEnvContext} from './env-files.js';

export type EnvInitResult = {
  ok: true;
  dockerEnvFile: string;
  created: boolean;
  mergedKeys: string[];
};

export async function runEnvInit(config: AppConfig): Promise<EnvInitResult> {
  if (config.repoRoot && resolveWorktreeContext(config.repoRoot).isWorktree) {
    const result = await runWorktreeEnv({cwd: config.cwd});

    return {
      ok: true,
      dockerEnvFile: result.envFile,
      created: result.createdEnvFile,
      mergedKeys: [],
    };
  }

  const context = resolveEnvContext(config);
  const result = await ensureEnvFile(context);

  return {
    ok: true,
    dockerEnvFile: context.dockerEnvFile,
    created: result.created,
    mergedKeys: result.mergedKeys,
  };
}

export function formatEnvInit(result: EnvInitResult): string {
  const lines = [`Environment initialized at ${result.dockerEnvFile}`];
  if (result.created) {
    lines.push('Created docker/.env.');
  }
  if (result.mergedKeys.length > 0) {
    lines.push(`Keys added from .env.example: ${result.mergedKeys.join(', ')}`);
  }
  return lines.join('\n');
}
