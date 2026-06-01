import {useEffect, useMemo, useRef, useState} from 'preact/hooks';

import {changedTaskState, isActiveTask, isTaskCollapsed, mergeTask, reconcileTaskViewState} from './tasks.ts';
import {readPrefs, writePrefs} from './preferences.js';

export function useDashboardSession(options = {}) {
  const isRefreshPaused = typeof options.isRefreshPaused === 'function' ? options.isRefreshPaused : () => false;
  const prefs = useMemo(readPrefs, []);
  const [activeFilter, setActiveFilterState] = useState(prefs.activeFilter || 'all');
  const [activityCollapsed, setActivityCollapsedState] = useState(prefs.activityCollapsed ?? true);
  const [countdown, setCountdown] = useState(20);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [maintenance, setMaintenance] = useState({days: 30, candidates: [], protected: [], loading: false, error: null});
  const [searchQuery, setSearchQueryState] = useState(prefs.searchQuery || '');
  const [tasks, setTasks] = useState([]);
  const [toast, setToast] = useState('');
  const [dismissedTaskIds, setDismissedTaskIds] = useState([]);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState({});
  const pendingStatusRefresh = useRef(false);
  const previousTasks = useRef([]);
  const toastTimer = useRef(null);

  const savePrefs = (patch) => writePrefs({activeFilter, activityCollapsed, searchQuery, ...patch});
  const showToast = (message) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToast(message);
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      setToast('');
    }, 2200);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status', {cache: 'no-store'});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError('');
      setCountdown(20);
    } catch (err) {
      setError(String(err.message || err));
    }
  };

  const fetchMaintenance = async (days = maintenance.days) => {
    setMaintenance((current) => ({...current, days, loading: true, error: null}));
    try {
      const res = await fetch(`/api/maintenance/worktrees/gc?days=${encodeURIComponent(String(days))}`, {
        cache: 'no-store',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setMaintenance({days, candidates: body.candidates || [], protected: body.protected || [], loading: false, error: null});
    } catch (err) {
      setMaintenance({days, candidates: [], protected: [], loading: false, error: String(err.message || err)});
    }
  };

  const postJson = async (url, payload) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await res.json();
    if (body.task) setTasks((current) => mergeTask(current, body.task));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  };

  const cancelTask = async (taskId) => {
    const body = await postJson(`/api/tasks/${encodeURIComponent(taskId)}/cancel`);
    showToast('Cancel requested');
    return body;
  };

  const requestStatusRefresh = () => {
    if (isRefreshPaused()) {
      pendingStatusRefresh.current = true;
      return;
    }

    pendingStatusRefresh.current = false;
    void fetchStatus();
  };

  useEffect(() => {
    if (!isRefreshPaused() && pendingStatusRefresh.current) {
      pendingStatusRefresh.current = false;
      void fetchStatus();
    }
  });

  useEffect(() => {
    void fetchStatus();
    void fetchMaintenance(7);
    const source = new EventSource('/api/tasks/stream');
    source.onmessage = (event) => {
      const next = JSON.parse(event.data).tasks || [];
      if (changedTaskState(previousTasks.current, next)) {
        requestStatusRefresh();
      }
      previousTasks.current = next;
      setTasks(next);
    };
    source.onerror = () => {
      setError('Task stream disconnected; status polling is still active.');
    };
    const timer = setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          requestStatusRefresh();
          return 20;
        }
        return current - 1;
      });
    }, 1000);
    return () => {
      source.close();
      clearInterval(timer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const next = reconcileTaskViewState(tasks, dismissedTaskIds, collapsedTaskIds);
    const dismissedChanged =
      next.dismissedTaskIds.length !== dismissedTaskIds.length ||
      next.dismissedTaskIds.some((taskId, index) => dismissedTaskIds[index] !== taskId);
    const collapsedEntries = Object.entries(collapsedTaskIds);
    const nextCollapsedEntries = Object.entries(next.collapsedTaskIds);
    const collapsedChanged =
      nextCollapsedEntries.length !== collapsedEntries.length ||
      nextCollapsedEntries.some(([taskId, value]) => collapsedTaskIds[taskId] !== value);

    if (dismissedChanged) {
      setDismissedTaskIds(next.dismissedTaskIds);
    }

    if (collapsedChanged) {
      setCollapsedTaskIds(next.collapsedTaskIds);
    }
  }, [collapsedTaskIds, dismissedTaskIds, tasks]);

  const setFilter = (filter) => {
    setActiveFilterState(filter);
    savePrefs({activeFilter: filter});
  };
  const setSearch = (query) => {
    setSearchQueryState(query);
    savePrefs({searchQuery: query});
  };
  const toggleActivity = () => {
    const next = !activityCollapsed;
    setActivityCollapsedState(next);
    savePrefs({activityCollapsed: next});
  };
  const dismissTask = (taskId) => {
    setDismissedTaskIds((current) => (current.includes(taskId) ? current : [...current, taskId]));
  };
  const dismissCompletedTasks = () => {
    setDismissedTaskIds((current) => {
      const next = new Set(current);
      for (const task of tasks) {
        if (!isActiveTask(task)) {
          next.add(task.id);
        }
      }
      return Array.from(next);
    });
  };
  const restoreDismissedTasks = () => {
    setDismissedTaskIds([]);
  };
  const toggleTaskCollapsed = (taskId) => {
    setCollapsedTaskIds((current) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) {
        return current;
      }

      return {
        ...current,
        [taskId]: !isTaskCollapsed(task, current),
      };
    });
  };
  const activityTasks = useMemo(
    () => tasks.filter((task) => !dismissedTaskIds.includes(task.id)),
    [dismissedTaskIds, tasks],
  );
  const taskCollapsed = (task) => isTaskCollapsed(task, collapsedTaskIds);

  return {
    activeFilter,
    activityCollapsed,
    activityTasks,
    cancelTask,
    countdown,
    data,
    dismissCompletedTasks,
    dismissTask,
    error,
    fetchMaintenance,
    fetchStatus,
    dismissedTaskCount: dismissedTaskIds.length,
    maintenance,
    postJson,
    restoreDismissedTasks,
    searchQuery,
    setFilter,
    setMaintenance,
    setSearch,
    showToast,
    taskCollapsed,
    tasks,
    toast,
    toggleActivity,
    toggleTaskCollapsed,
  };
}
