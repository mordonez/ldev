import {h} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

import {classNames} from '../lib/dashboard-state.js';
import {isActiveTask, taskTime} from '../lib/tasks.ts';

export function Activity({
  collapsed,
  hiddenCount,
  onCancel,
  onClearDone,
  onDismiss,
  onRestoreHidden,
  onToggle,
  onToggleTask,
  taskCollapsed,
  tasks,
}) {
  const [leavingTaskIds, setLeavingTaskIds] = useState([]);
  const dismissTimers = useRef(new Map());

  useEffect(
    () => () => {
      for (const timer of dismissTimers.current.values()) {
        clearTimeout(timer);
      }
      dismissTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    const visibleTaskIds = new Set(tasks.map((task) => task.id));
    setLeavingTaskIds((current) => current.filter((taskId) => visibleTaskIds.has(taskId)));
    for (const [taskId, timer] of dismissTimers.current.entries()) {
      if (!visibleTaskIds.has(taskId)) {
        clearTimeout(timer);
        dismissTimers.current.delete(taskId);
      }
    }
  }, [tasks]);

  const running = tasks.filter((task) => isActiveTask(task)).length;
  const finished = tasks.filter((task) => !isActiveTask(task)).length;
  const handleDismiss = (taskId) => {
    if (leavingTaskIds.includes(taskId)) {
      return;
    }

    setLeavingTaskIds((current) => [...current, taskId]);
    const timer = setTimeout(() => {
      dismissTimers.current.delete(taskId);
      setLeavingTaskIds((current) => current.filter((currentTaskId) => currentTaskId !== taskId));
      onDismiss(taskId);
    }, 180);
    dismissTimers.current.set(taskId, timer);
  };

  return (
    <aside class={classNames('activity', collapsed && 'is-collapsed')}>
      <div class="activity-header">
        <div>
          <div class="activity-title">Activity</div>
          <div class="activity-meta">
            {running ? `${running} active task${running === 1 ? '' : 's'}` : 'No active tasks'}
            {hiddenCount ? ` · ${hiddenCount} hidden` : ''}
          </div>
        </div>
        <div class="activity-actions">
          {finished ? (
            <button class="activity-secondary" type="button" onClick={onClearDone}>
              Clear done
            </button>
          ) : null}
          {hiddenCount ? (
            <button class="activity-secondary" type="button" onClick={onRestoreHidden}>
              Restore hidden
            </button>
          ) : null}
          <button class="activity-toggle" type="button" aria-expanded={!collapsed} onClick={onToggle}>
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>
      <div class="activity-body">
        {tasks.length === 0 ? (
          <div class="task-empty">
            {hiddenCount ? 'All visible activity is hidden right now.' : 'Long-running actions will stream here.'}
          </div>
        ) : (
          <div class="activity-list">
            {tasks.map((task) => {
              const collapsedTask = taskCollapsed(task);
              const lastEntry = task.logs?.[task.logs.length - 1] ?? null;
              const leaving = leavingTaskIds.includes(task.id);
              return (
                <article class={classNames('task-card', task.status, collapsedTask && 'is-collapsed', leaving && 'is-leaving')} key={task.id}>
                  <div class="task-head">
                    <div class="task-head-copy">
                      <div class="task-title-row">
                        <div class="task-title">{task.label}</div>
                        <span class={classNames('task-status', task.status)}>
                          {task.status === 'succeeded' ? 'done' : task.status}
                        </span>
                      </div>
                      <div class="task-sub">
                        {taskTime(task.startedAt)}
                        {task.endedAt ? ` - ${taskTime(task.endedAt)}` : ''}
                      </div>
                      {collapsedTask && lastEntry?.message ? <div class="task-preview">{lastEntry.message}</div> : null}
                    </div>
                    <div class="task-head-actions">
                      <button class="task-toggle" type="button" onClick={() => onToggleTask(task.id)}>
                        {collapsedTask ? 'Expand' : 'Collapse'}
                      </button>
                      {task.status === 'running' ? (
                        <button class="task-cancel" type="button" onClick={() => onCancel(task.id)}>
                          Cancel
                        </button>
                      ) : null}
                      {!isActiveTask(task) ? (
                        <button class="task-dismiss" type="button" onClick={() => handleDismiss(task.id)}>
                          Dismiss
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div class="task-log">
                    {(task.logs || []).map((entry) => (
                      <div class={classNames('task-line', entry.level)} key={entry.id}>
                        <span class="task-time">{taskTime(entry.timestamp)}</span>
                        <span class="task-msg">{entry.message}</span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
