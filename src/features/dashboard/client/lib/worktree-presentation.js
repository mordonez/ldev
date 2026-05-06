import {actionKind, primaryActionForWorktree} from './actions.js';
import {isDirty, isRunning, needsAttention} from './dashboard-state.js';
import {buildSections} from '../components/worktree-sections.jsx';

export function buildWorktreePresentation(wt, tasks, activeSection) {
  const running = isRunning(wt);
  const stopped = wt.env && !running;
  const sections = buildSections(wt);
  const selected = sections.find((section) => section.key === activeSection) || sections[0];
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
    badges: worktreeBadges(wt, running),
    busy: (action) =>
      tasks.some(
        (task) => task.status === 'running' && task.kind === actionKind(action) && task.worktreeName === wt.name,
      ),
    primary,
    running,
    sections,
    selected,
    stopped,
  };
}

function worktreeActions(wt, running, stopped, primary, busy, activeWorktreeTask) {
  const busyWorktree = Boolean(activeWorktreeTask);
  const busyLabel = activeWorktreeTask?.status === 'canceling' ? 'Canceling...' : '...';
  const actions = [
    {
      action: primary[0],
      className: primary[1],
      disabled: busyWorktree,
      label: busyWorktree ? busyLabel : primary[2],
      target: 'action',
    },
  ];

  if (primary[0] !== 'start' && !running) {
    actions.push({
      action: 'start',
      className: 'btn-start',
      disabled: busyWorktree,
      label: busyWorktree ? busyLabel : 'Start',
      target: 'action',
    });
  }

  if (wt.env && !stopped) {
    actions.push({
      action: 'stop',
      className: 'btn-stop',
      disabled: busyWorktree,
      label: busyWorktree ? busyLabel : 'Stop',
      target: 'action',
    });
  }

  if (wt.env?.liferay) actions.push({className: 'btn-logs', label: 'Logs', target: 'logs'});

  actions.push({className: 'btn-ghost', disabled: busyWorktree, label: 'DB sync', target: 'db'});

  const advancedActions = [
    {className: 'btn-ghost', disabled: busyWorktree, label: 'Resource export', target: 'resource'},
    {
      action: 'mcp-setup',
      className: 'btn-ghost',
      disabled: busyWorktree,
      label: busyWorktree ? busyLabel : 'MCP setup',
      target: 'action',
    },
  ];

  if (wt.env) {
    advancedActions.push(
      {
        action: 'deploy-status',
        className: 'btn-ghost',
        disabled: busyWorktree,
        label: 'Deploy status',
        target: 'action',
      },
      {
        action: 'deploy-cache-update',
        className: 'btn-ghost',
        disabled: busyWorktree,
        label: busyWorktree ? busyLabel : 'Cache update',
        target: 'action',
      },
      {
        action: 'recreate',
        className: 'btn-ghost',
        disabled: busyWorktree,
        label: busyWorktree ? busyLabel : 'Recreate',
        target: 'action',
      },
    );
  }

  if (!wt.isMain) advancedActions.push({className: 'btn-delete', disabled: busyWorktree, label: 'Delete', target: 'delete'});

  return {actions, advancedActions};
}

function worktreeBadges(wt, running) {
  const badges = [];
  if (wt.isMain) badges.push({label: 'main', tone: 'blue'});
  if (isDirty(wt)) badges.push({label: `${wt.changedFiles} changed`, tone: 'yellow'});
  badges.push(
    running
      ? {label: 'running', tone: 'green'}
      : wt.env
        ? {label: 'stopped', tone: 'gray'}
        : {label: 'no env', tone: 'gray'},
  );
  if (needsAttention(wt)) badges.push({label: 'attention', tone: 'red'});
  return badges;
}
