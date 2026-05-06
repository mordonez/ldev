import {actionKind, primaryActionForWorktree} from './actions.js';
import {isDirty, isRunning, needsAttention} from './dashboard-state.js';
import {buildSections} from '../components/worktree-sections.jsx';

export function buildWorktreePresentation(wt, tasks, activeSection) {
  const running = isRunning(wt);
  const stopped = wt.env && !running;
  const sections = buildSections(wt);
  const selected = sections.find((section) => section.key === activeSection) || sections[0];
  const primary = primaryActionForWorktree(wt, running, stopped);

  return {
    actions: worktreeActions(wt, running, stopped, primary, (action) =>
      tasks.some((task) => task.status === 'running' && task.kind === actionKind(action) && task.worktreeName === wt.name),
    ),
    badges: worktreeBadges(wt, running),
    busy: (action) => tasks.some((task) => task.status === 'running' && task.kind === actionKind(action) && task.worktreeName === wt.name),
    primary,
    running,
    sections,
    selected,
    stopped,
  };
}

function worktreeActions(wt, running, stopped, primary, busy) {
  const actions = [
    {
      action: primary[0],
      className: primary[1],
      disabled: busy(primary[0]),
      label: busy(primary[0]) ? '...' : primary[2],
      target: 'action',
    },
  ];

  if (primary[0] !== 'start' && !running) {
    actions.push({
      action: 'start',
      className: 'btn-start',
      disabled: busy('start'),
      label: busy('start') ? '...' : 'Start',
      target: 'action',
    });
  }

  if (wt.env && !stopped) {
    actions.push({
      action: 'stop',
      className: 'btn-stop',
      disabled: busy('stop'),
      label: busy('stop') ? '...' : 'Stop',
      target: 'action',
    });
  }

  if (wt.env?.liferay) actions.push({className: 'btn-logs', label: 'Logs', target: 'logs'});

  actions.push(
    {className: 'btn-ghost', label: 'DB', target: 'db'},
    {className: 'btn-ghost', label: 'Resource export', target: 'resource'},
    {
      action: 'mcp-setup',
      className: 'btn-ghost',
      disabled: busy('mcp-setup'),
      label: busy('mcp-setup') ? '...' : 'MCP setup',
      target: 'action',
    },
  );

  if (wt.env) {
    actions.push(
      {
        action: 'deploy-status',
        className: 'btn-ghost',
        disabled: busy('deploy-status'),
        label: 'Deploy status',
        target: 'action',
      },
      {
        action: 'deploy-cache-update',
        className: 'btn-ghost',
        disabled: busy('deploy-cache-update'),
        label: busy('deploy-cache-update') ? '...' : 'Cache update',
        target: 'action',
      },
      {
        action: 'recreate',
        className: 'btn-ghost',
        disabled: busy('recreate'),
        label: busy('recreate') ? '...' : 'Recreate',
        target: 'action',
      },
    );
  }

  if (!wt.isMain) actions.push({className: 'btn-delete', label: 'Delete', target: 'delete'});

  return actions;
}

function worktreeBadges(wt, running) {
  const badges = [];
  if (wt.isMain) badges.push({label: 'main', tone: 'blue'});
  if (isDirty(wt)) badges.push({label: `${wt.changedFiles} changed`, tone: 'yellow'});
  badges.push(running ? {label: 'running', tone: 'green'} : wt.env ? {label: 'stopped', tone: 'gray'} : {label: 'no env', tone: 'gray'});
  if (needsAttention(wt)) badges.push({label: 'attention', tone: 'red'});
  return badges;
}
