import {loadConfig, type AppConfig} from '../../core/config/load-config.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {isGitRepository} from '../../core/platform/git.js';

import {WorktreeErrors} from './errors/worktree-error-factory.js';
import {resolveWorktreeContext, type WorktreeContext} from './worktree-paths.js';

export type WorktreeFlowContext = {
  config: AppConfig;
  context: WorktreeContext;
};

export async function prepareWorktreeFlow(options: {cwd: string; commandName: string}): Promise<WorktreeFlowContext> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot || !(await isGitRepository(config.repoRoot))) {
    throw WorktreeErrors.repoNotFound(`worktree ${options.commandName} must be run inside a valid git repository.`);
  }

  const capabilities = await detectCapabilities(config.cwd);
  if (!capabilities.supportsWorktrees) {
    throw WorktreeErrors.capabilityMissing('Git worktrees are not available in this environment.');
  }

  return {
    config,
    context: resolveWorktreeContext(config.repoRoot),
  };
}
