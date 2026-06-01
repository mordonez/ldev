import {h} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

import {IconActivity, IconAlertTriangle, IconCheck, IconChevronDown, IconRotateCcw} from '../lib/icons.jsx';
import {cx} from '../lib/cx.js';
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
      for (const timer of dismissTimers.current.values()) clearTimeout(timer);
      dismissTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    const visibleTaskIds = new Set(tasks.map((t) => t.id));
    setLeavingTaskIds((cur) => cur.filter((id) => visibleTaskIds.has(id)));
    for (const [id, timer] of dismissTimers.current.entries()) {
      if (!visibleTaskIds.has(id)) {
        clearTimeout(timer);
        dismissTimers.current.delete(id);
      }
    }
  }, [tasks]);

  const running = tasks.filter((t) => isActiveTask(t)).length;
  const finished = tasks.filter((t) => !isActiveTask(t)).length;

  const handleDismiss = (taskId) => {
    if (leavingTaskIds.includes(taskId)) return;
    setLeavingTaskIds((cur) => [...cur, taskId]);
    const timer = setTimeout(() => {
      dismissTimers.current.delete(taskId);
      setLeavingTaskIds((cur) => cur.filter((id) => id !== taskId));
      onDismiss(taskId);
    }, 180);
    dismissTimers.current.set(taskId, timer);
  };

  return (
    <div class="dock">
      <div class="dock-inner">
        <div class="dock-head" onClick={onToggle}>
          <span class="dt">
            {running ? <span class="dock-spin" /> : <IconActivity size={13} />}
            Activity
          </span>
          <span class="dmeta">
            {running ? `${running} running` : 'No active tasks'}
            {hiddenCount ? ` · ${hiddenCount} hidden` : ''}
          </span>
          <div class="dock-spacer" />
          {finished ? (
            <button class="dock-act-btn" type="button" onClick={(e) => { e.stopPropagation(); onClearDone(); }}>
              Clear done
            </button>
          ) : null}
          {hiddenCount ? (
            <button class="dock-act-btn" type="button" onClick={(e) => { e.stopPropagation(); onRestoreHidden(); }}>
              Restore hidden
            </button>
          ) : null}
          <span class={cx('dock-chevron', !collapsed && 'open')} style={{display:'flex'}}><IconChevronDown size={16} /></span>
        </div>

        {!collapsed && (
          <div class="dock-body">
            {tasks.length === 0 ? (
              <div class="dock-empty">
                {hiddenCount ? 'All visible activity is hidden.' : 'Long-running actions will stream here.'}
              </div>
            ) : (
              tasks.map((task) => (
                <DockTask
                  key={task.id}
                  task={task}
                  leaving={leavingTaskIds.includes(task.id)}
                  collapsed={taskCollapsed(task)}
                  onCancel={onCancel}
                  onDismiss={handleDismiss}
                  onToggle={onToggleTask}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DockTask({task, leaving, collapsed, onCancel, onDismiss, onToggle}) {
  const active = isActiveTask(task);
  const statusLabel = task.status === 'succeeded' ? 'done' : task.status;
  const lastEntry = task.logs?.[task.logs.length - 1] ?? null;

  return (
    <div class={cx('dock-task', task.status, leaving && 'is-leaving')}>
      <div class="dock-task-top">
        <span class="dock-task-ic">
          {task.status === 'running' ? <IconRotateCcw size={14} /> :
           task.status === 'failed' ? <IconAlertTriangle size={14} /> :
           <IconCheck size={14} />}
        </span>
        <div class="dock-task-main">
          <div class="dock-task-title">{task.label}</div>
          <div class="dock-task-sub">
            {taskTime(task.startedAt)}
            {task.endedAt ? ` – ${taskTime(task.endedAt)}` : ''}
          </div>
        </div>
        <span class={`dock-task-st ${task.status}`}>{statusLabel}</span>
        <div class="dock-task-actions">
          <button class="dock-act-btn" type="button" onClick={() => onToggle(task.id)}>
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          {task.status === 'running' && (
            <button class="dock-act-cancel" type="button" onClick={() => onCancel(task.id)}>Cancel</button>
          )}
          {!active && (
            <button class="dock-act-btn" type="button" onClick={() => onDismiss(task.id)}>Dismiss</button>
          )}
        </div>
      </div>
      {!collapsed && (task.logs?.length ? (
        <div class="dock-task-log">
          {task.logs.map((entry) => (
            <div class={cx('dock-task-line', entry.level)} key={entry.id}>
              <span class="dock-task-time">{taskTime(entry.timestamp)}</span>
              <span class="dock-task-msg">{entry.message}</span>
            </div>
          ))}
        </div>
      ) : collapsed && lastEntry?.message ? (
        <div class="dock-task-log">
          <div class="dock-task-line"><span class="dock-task-time" /><span class="dock-task-msg">{lastEntry.message}</span></div>
        </div>
      ) : null)}
    </div>
  );
}
