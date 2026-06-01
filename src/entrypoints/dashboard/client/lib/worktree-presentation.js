import {actionKind, primaryActionForWorktree, worktreeButton} from './actions.ts';
import {isRunning, needsAttention, serviceTone} from './dashboard-state.js';

export function buildWorktreePresentation(wt, tasks) {
  const running = isRunning(wt);
  const stopped = wt.env && !running;
  const cardStatus = computeCardStatus(wt, running);
  const primary = primaryActionForWorktree(wt, running, stopped);
  const activeWorktreeTask = tasks.find(
    (task) => (task.status === 'running' || task.status === 'canceling') && task.worktreeName === wt.name,
  );

  return {
    ...worktreeActions(
      wt,
      running,
      stopped,
      primary,
      (action) =>
        tasks.some(
          (task) => task.status === 'running' && task.kind === actionKind(action) && task.worktreeName === wt.name,
        ),
      activeWorktreeTask,
    ),
    cardStatus,
    busy: (action) =>
      tasks.some(
        (task) => task.status === 'running' && task.kind === actionKind(action) && task.worktreeName === wt.name,
      ),
    primary,
    running,
    stopped,
  };
}

function worktreeActions(wt, running, stopped, primary, busy, activeWorktreeTask) {
  const busyWorktree = Boolean(activeWorktreeTask);
  const busyLabel = activeWorktreeTask?.status === 'canceling' ? 'Canceling...' : '...';
  const actions = [
    {
      action: primary.action,
      className: primary.className,
      disabled: busyWorktree,
      label: busyWorktree ? busyLabel : primary.label,
      target: 'action',
    },
  ];

  if (primary.action !== 'start' && !running) {
    actions.push(
      worktreeButton('start', {
        disabled: busyWorktree,
        label: busyWorktree ? busyLabel : 'Start',
      }),
    );
  }

  if (wt.env && !stopped) {
    actions.push(
      worktreeButton('stop', {
        disabled: busyWorktree,
        label: busyWorktree ? busyLabel : 'Stop',
      }),
    );
  }

  if (wt.env?.liferay) actions.push(worktreeButton('logs'));

  actions.push(worktreeButton('db', {disabled: busyWorktree}));

  const advancedActions = [
    worktreeButton('resource', {disabled: busyWorktree}),
    worktreeButton('oauth-install', {
      disabled: busyWorktree,
      label: busyWorktree ? busyLabel : 'OAuth install',
    }),
  ];

  if (wt.env) {
    advancedActions.push(
      worktreeButton('deploy-status', {
        disabled: busyWorktree,
        label: 'Deploy status',
      }),
      worktreeButton('deploy-cache-update', {
        disabled: busyWorktree,
        label: busyWorktree ? busyLabel : 'Cache update',
      }),
      worktreeButton('recreate', {
        disabled: busyWorktree,
        label: busyWorktree ? busyLabel : 'Recreate',
      }),
    );
  }

  if (!wt.isMain) advancedActions.push(worktreeButton('delete', {disabled: busyWorktree}));

  return {actions, advancedActions};
}

function computeCardStatus(wt, running) {
  if (running) {
    const services = wt.env?.services || [];
    const hasBadSvc = services.some((s) => serviceTone(s) === 'yellow' || serviceTone(s) === 'red');
    return hasBadSvc || wt.env?.portalReachable === false ? 'error' : 'running';
  }
  if (needsAttention(wt)) return 'attention';
  if (wt.isMain) return 'main';
  return null;
}
