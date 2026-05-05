import {h} from 'preact';

import {classNames} from '../lib/dashboard-state.js';
import {taskTime} from '../lib/tasks.js';

export function Activity({collapsed, onToggle, tasks}) {
  const running = tasks.filter((task) => task.status === 'running').length;
  return (
    <aside class={classNames('activity', collapsed && 'is-collapsed')}>
      <div class="activity-header">
        <div>
          <div class="activity-title">Activity</div>
          <div class="activity-meta">{running ? `${running} active task${running === 1 ? '' : 's'}` : 'No active tasks'}</div>
        </div>
        <button class="activity-toggle" type="button" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      <div class="activity-body">
        {tasks.length === 0 ? (
          <div class="task-empty">Long-running actions will stream here.</div>
        ) : (
          tasks.map((task) => (
            <div class={classNames('task-card', task.status)} key={task.id}>
              <div class="task-head">
                <div>
                  <div class="task-title">{task.label}</div>
                  <div class="task-sub">{taskTime(task.startedAt)}</div>
                </div>
                <span class={classNames('task-status', task.status)}>{task.status === 'succeeded' ? 'done' : task.status}</span>
              </div>
              <div class="task-log">
                {(task.logs || []).map((entry) => (
                  <div class={classNames('task-line', entry.level)} key={entry.id}>
                    <span class="task-time">{taskTime(entry.timestamp)}</span>
                    <span class="task-msg">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
