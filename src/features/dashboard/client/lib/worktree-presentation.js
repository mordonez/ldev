import {actionKind, primaryActionForWorktree} from './actions.js';
import {isDirty, isRunning, needsAttention} from './dashboard-state.js';
import {buildSections} from '../components/worktree-sections.jsx';

export function buildWorktreePresentation(wt, tasks, activeSection) {
  const running = isRunning(wt);
  const stopped = wt.env && !running;
  const sections = buildSections(wt);
  const selected = sections.find((section) => section.key === activeSection) || sections[0];

  return {
    badges: worktreeBadges(wt, running),
    busy: (action) => tasks.some((task) => task.status === 'running' && task.kind === actionKind(action) && task.worktreeName === wt.name),
    primary: primaryActionForWorktree(wt, running, stopped),
    running,
    sections,
    selected,
    stopped,
  };
}

function worktreeBadges(wt, running) {
  const badges = [];
  if (wt.isMain) badges.push({label: 'main', tone: 'blue'});
  if (isDirty(wt)) badges.push({label: `${wt.changedFiles} changed`, tone: 'yellow'});
  badges.push(running ? {label: 'running', tone: 'green'} : wt.env ? {label: 'stopped', tone: 'gray'} : {label: 'no env', tone: 'gray'});
  if (needsAttention(wt)) badges.push({label: 'attention', tone: 'red'});
  return badges;
}
