export const FILTERS = [
  ['all', 'All'],
  ['attention', 'Needs attention'],
  ['running', 'Running'],
  ['dirty', 'Dirty'],
  ['up', 'Up'],
  ['main', 'Main'],
];

export function serviceName(service) {
  return service.service || service.name || 'service';
}

export function serviceStatusLabel(service) {
  if (service.state && service.health) {
    return `${service.state} (${service.health})`;
  }

  return service.state || service.health || 'not running';
}

export function serviceTone(service) {
  if (service.state === 'running' && (service.health === 'healthy' || !service.health)) return 'green';
  if (service.state === 'running') return 'yellow';
  if (service.state === 'exited' || service.state === 'dead') return 'red';
  return 'gray';
}

export function isRunning(wt) {
  return wt.env?.liferay?.state === 'running';
}

export function isDirty(wt) {
  return (wt.changedFiles || 0) > 0;
}

export function isBehind(wt) {
  return (wt.aheadBehind?.behind || 0) > 0;
}

export function attentionReasons(wt) {
  const reasons = [];
  if (isDirty(wt)) reasons.push(`${wt.changedFiles} changed file(s)`);
  if (isBehind(wt)) reasons.push(`${wt.aheadBehind.behind} commit(s) behind ${wt.aheadBehind.base}`);
  if (wt.env?.status === 'error') reasons.push(`env error: ${wt.env.error || 'unknown'}`);
  if (isRunning(wt)) {
    if (wt.env?.portalReachable === false) reasons.push('portal not reachable');
    for (const service of wt.env?.services || []) {
      if (serviceTone(service) === 'red') reasons.push(`service ${serviceName(service)}: ${serviceStatusLabel(service)}`);
    }
  }
  return reasons;
}

export function needsAttention(wt) {
  return attentionReasons(wt).length > 0;
}

export function matchesFilter(wt, filter) {
  if (filter === 'attention') return needsAttention(wt);
  if (filter === 'running') return isRunning(wt);
  if (filter === 'dirty') return isDirty(wt);
  if (filter === 'up') return wt.env?.portalReachable === true;
  if (filter === 'main') return wt.isMain;
  return true;
}

export function matchesSearch(wt, query) {
  if (!query) return true;
  return [wt.name, wt.path, wt.branch].filter(Boolean).join(' ').toLowerCase().includes(query);
}

export function priority(wt) {
  if (isRunning(wt)) return 0;
  if (needsAttention(wt)) return 1;
  if (wt.isMain) return 2;
  return 3;
}

const STARTING_KINDS = new Set(['worktree-start', 'worktree-init-env', 'worktree-restart']);

export function isWorktreeStarting(tasks, name) {
  return tasks?.some(
    (t) => (t.status === 'running' || t.status === 'canceling') &&
      t.worktreeName === name && STARTING_KINDS.has(t.kind),
  ) ?? false;
}

export function isWorktreeStopping(tasks, name) {
  return tasks?.some(
    (t) => (t.status === 'running' || t.status === 'canceling') &&
      t.worktreeName === name && t.kind === 'worktree-stop',
  ) ?? false;
}
