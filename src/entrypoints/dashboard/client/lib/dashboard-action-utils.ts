export function normalizeDeleteBranchCandidate(branch: string | null | undefined): string | null {
  const normalizedBranch = typeof branch === 'string' ? branch.trim() : '';
  if (!normalizedBranch || normalizedBranch === '-' || normalizedBranch === 'HEAD detached') {
    return null;
  }

  return normalizedBranch;
}

export function buildDeleteWorktreeUrl(name: string, deleteBranch: boolean): string {
  return `/api/worktrees/${encodeURIComponent(name)}${deleteBranch ? '?deleteBranch=true' : ''}`;
}
