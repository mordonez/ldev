import {loadConfig, type AppConfig} from '../../core/config/load-config.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {getRepoRoot, isGitRepository} from '../../core/platform/git.js';

import {WorktreeErrors} from './errors/worktree-error-factory.js';
import {resolveWorktreeContext, type WorktreeContext} from './worktree-paths.js';

export type WorktreeFlowContext = {
  config: AppConfig;
  context: WorktreeContext;
};

export async function prepareWorktreeFlow(options: {cwd: string; commandName: string}): Promise<WorktreeFlowContext> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  const repoRoot = config.repoRoot ?? (await getRepoRoot(options.cwd));
  if (!repoRoot || !(await isGitRepository(repoRoot))) {
    throw WorktreeErrors.repoNotFound(`worktree ${options.commandName} must be run inside a valid git repository.`);
  }

  const capabilities = await detectCapabilities(config.cwd);
  if (!capabilities.supportsWorktrees) {
    throw WorktreeErrors.capabilityMissing('Git worktrees are not available in this environment.');
  }

  return {
    config: {
      ...config,
      repoRoot,
    },
    context: resolveWorktreeContext(repoRoot),
  };
}
