export const FILTERS = [
  ['all', 'All'],
  ['attention', 'Needs attention'],
  ['running', 'Running'],
  ['dirty', 'Dirty'],
  ['up', 'Up'],
  ['main', 'Main'],
];

export function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

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

export function needsAttention(wt) {
  if (isDirty(wt) || isBehind(wt)) return true;
  if (!wt.env) return false;
  if (wt.env.portalReachable === false) return true;
  return (wt.env.services || []).some((service) => serviceTone(service) === 'red');
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
