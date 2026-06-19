import path from 'node:path';

import {readProfileFile, resolveLiferayProfileFiles} from '../../core/config/liferay-profile.js';
import {
  collectDashboardWorktrees,
  type CollectDashboardWorktreeOptions,
  type DashboardWorktree,
} from './dashboard-worktree-snapshot.js';

export type DashboardStatus = {
  cwd: string;
  refreshedAt: string;
  worktrees: DashboardWorktree[];
  defaultWorktreeBase?: string;
};

export type CollectDashboardStatusOptions = CollectDashboardWorktreeOptions;

export async function collectDashboardStatus(
  cwd: string,
  options?: CollectDashboardStatusOptions,
): Promise<DashboardStatus> {
  const mainRepoRoot = path.resolve(cwd);
  const worktrees = await collectDashboardWorktrees(cwd, options);

  const profileFiles = resolveLiferayProfileFiles(mainRepoRoot);
  const shared = profileFiles.shared ? readProfileFile(profileFiles.shared) : {};
  const local = profileFiles.local ? readProfileFile(profileFiles.local) : {};
  const defaultWorktreeBase = local['worktree.defaultBase'] || shared['worktree.defaultBase'] || undefined;

  return {
    cwd: mainRepoRoot,
    refreshedAt: new Date().toISOString(),
    worktrees,
    defaultWorktreeBase,
  };
}
