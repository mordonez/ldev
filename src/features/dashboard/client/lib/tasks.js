export function actionKind(action) {
  if (action === 'init-env') return 'worktree-env-init';
  if (action === 'restart') return 'env-restart';
  if (action === 'recreate') return 'env-recreate';
  if (action === 'deploy-status') return 'deploy-status';
  if (action === 'deploy-cache-update') return 'deploy-cache-update';
  if (action === 'mcp-setup') return 'mcp-setup';
  if (action === 'doctor') return 'doctor';
  return `worktree-${action}`;
}

export function taskTime(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export function changedTaskState(previous, next) {
  if (previous.length !== next.length) return true;
  return next.some((task, index) => !previous[index] || previous[index].id !== task.id || previous[index].status !== task.status);
}
