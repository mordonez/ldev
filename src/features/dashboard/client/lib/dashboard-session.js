import {useEffect, useMemo, useRef, useState} from 'preact/hooks';

import {changedTaskState} from './tasks.js';
import {readPrefs, writePrefs} from './preferences.js';

export function useDashboardSession() {
  const prefs = useMemo(readPrefs, []);
  const [activeFilter, setActiveFilterState] = useState(prefs.activeFilter || 'all');
  const [activityCollapsed, setActivityCollapsedState] = useState(prefs.activityCollapsed ?? true);
  const [cardSections, setCardSections] = useState(prefs.cardSections || {});
  const [countdown, setCountdown] = useState(20);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [maintenance, setMaintenance] = useState({days: 7, candidates: [], loading: false, error: null});
  const [searchQuery, setSearchQueryState] = useState(prefs.searchQuery || '');
  const [tasks, setTasks] = useState([]);
  const [toast, setToast] = useState('');
  const previousTasks = useRef([]);

  const savePrefs = (patch) => writePrefs({activeFilter, activityCollapsed, searchQuery, cardSections, ...patch});
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
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
      const res = await fetch(`/api/maintenance/worktrees/gc?days=${encodeURIComponent(String(days))}`, {cache: 'no-store'});
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setMaintenance({days, candidates: body.candidates || [], loading: false, error: null});
    } catch (err) {
      setMaintenance({days, candidates: [], loading: false, error: String(err.message || err)});
    }
  };

  const postJson = async (url, payload) => {
    const res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: payload ? JSON.stringify(payload) : undefined});
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  };

  useEffect(() => {
    void fetchStatus();
    void fetchMaintenance(7);
    const source = new EventSource('/api/tasks/stream');
    source.onmessage = (event) => {
      const next = JSON.parse(event.data).tasks || [];
      if (changedTaskState(previousTasks.current, next)) void fetchStatus();
      previousTasks.current = next;
      setTasks(next);
    };
    const timer = setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          void fetchStatus();
          return 20;
        }
        return current - 1;
      });
    }, 1000);
    return () => {
      source.close();
      clearInterval(timer);
    };
  }, []);

  const setFilter = (filter) => {
    setActiveFilterState(filter);
    savePrefs({activeFilter: filter});
  };
  const setSearch = (query) => {
    setSearchQueryState(query);
    savePrefs({searchQuery: query});
  };
  const setSection = (name, section) => {
    const next = {...cardSections, [name]: section};
    setCardSections(next);
    savePrefs({cardSections: next});
  };
  const toggleActivity = () => {
    const next = !activityCollapsed;
    setActivityCollapsedState(next);
    savePrefs({activityCollapsed: next});
  };

  return {
    activeFilter,
    activityCollapsed,
    cardSections,
    countdown,
    data,
    error,
    fetchMaintenance,
    fetchStatus,
    maintenance,
    postJson,
    searchQuery,
    setFilter,
    setMaintenance,
    setSearch,
    setSection,
    showToast,
    tasks,
    toast,
    toggleActivity,
  };
}
