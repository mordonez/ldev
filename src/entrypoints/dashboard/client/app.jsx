import {Fragment, h, render} from 'preact';
import {useCallback, useMemo, useRef, useState} from 'preact/hooks';

import {Activity} from './components/activity.jsx';
import {CreateModal} from './components/create-modal.jsx';
import {DetailSheet} from './components/detail-sheet.jsx';
import {Header} from './components/header.jsx';
import {Maintenance} from './components/maintenance.jsx';
import {Overview} from './components/overview.jsx';
import {Toolbar} from './components/toolbar.jsx';
import {WorktreeCard} from './components/worktree-card.jsx';
import {DashboardActionModals, useDashboardActions} from './lib/dashboard-actions.jsx';
import {FILTERS, isRunning, isDirty, matchesFilter, matchesSearch, needsAttention, priority} from './lib/dashboard-state.js';
import {useDashboardSession} from './lib/dashboard-session.js';
import {readPrefs, writePrefs} from './lib/preferences.js';
import './styles.css';

function App() {
  const [showCreate, setShowCreate] = useState(false);
  const [sort, setSort] = useState('priority');
  const [theme, setTheme] = useState(() => {
    const t = readPrefs().theme || 'light';
    document.documentElement.setAttribute('data-theme', t);
    return t;
  });
  const [selectedWt, setSelectedWt] = useState(null);
  const [copiedPath, setCopiedPath] = useState(null);
  const modalOpenRef = useRef(false);

  const {
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
    dismissedTaskCount,
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
  } = useDashboardSession({isRefreshPaused: () => modalOpenRef.current});
  const actions = useDashboardActions({fetchStatus, postJson, showToast});

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    writePrefs({...readPrefs(), theme: next});
  };

  const worktrees = useMemo(() => {
    const list = (data?.worktrees || []).slice();
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'changes') list.sort((a, b) => (b.changedFiles || 0) - (a.changedFiles || 0) || priority(a) - priority(b));
    else list.sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name));
    return list;
  }, [data, sort]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(([key]) => [key, worktrees.filter((wt) => matchesFilter(wt, key)).length])),
    [worktrees],
  );

  const visible = useMemo(
    () => {
      const q = searchQuery.toLowerCase();
      return worktrees.filter((wt) => matchesFilter(wt, activeFilter) && matchesSearch(wt, q));
    },
    [worktrees, activeFilter, searchQuery],
  );
  const sheetWt = selectedWt ? (worktrees.find((w) => w.name === selectedWt) ?? null) : null;

  const handleCopy = useCallback((path) => {
    actions.copyPath(path);
    setCopiedPath(path);
  }, [actions]);

  const modalOpen = showCreate || actions.hasOpenModal;
  modalOpenRef.current = modalOpen;

  const refreshLabel = error
    ? 'Error'
    : modalOpen
      ? 'Paused'
      : data
        ? `${new Date(data.refreshedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})} · ${countdown}s`
        : '—';

  const stats = useMemo(() => {
    const wts = data?.worktrees || [];
    const s = {total: wts.length, running: 0, attention: 0, attentionOnly: 0, error: 0, dirty: 0, up: 0, idle: 0, withEnv: 0};
    for (const wt of wts) {
      const run = isRunning(wt);
      if (wt.env) s.withEnv++;
      if (run) {
        s.running++;
        if (wt.env?.portalReachable !== false) s.up++;
        const services = wt.env?.services || [];
        const hasBadSvc = services.some((svc) => svc.state !== 'running' && svc.state !== 'starting');
        if (hasBadSvc || wt.env?.portalReachable === false) s.error++;
      }
      if (needsAttention(wt)) s.attention++;
      if (isDirty(wt)) s.dirty++;
      if (!run && !needsAttention(wt) && !wt.isMain) s.idle++;
      if (needsAttention(wt) && !run) s.attentionOnly++;
    }
    return s;
  }, [data]);

  return (
    <Fragment>
      <Header
        cwd={data?.cwd || ''}
        onDiagnose={() => actions.openDoctor(null)}
        onNew={() => setShowCreate(true)}
        onRefresh={fetchStatus}
        onSearch={setSearch}
        onToggleTheme={toggleTheme}
        query={searchQuery}
        refreshLabel={refreshLabel}
        refreshPaused={modalOpen}
        theme={theme}
      />
      <main>
        {data ? (
          <Fragment>
            <Overview stats={stats} activeFilter={activeFilter} onFilter={setFilter} />
            <Maintenance
              maintenance={maintenance}
              onApply={(days) => {
                if (!window.confirm('Apply GC will permanently remove the listed worktree directories and local runtime data. Local branches are kept.')) return;
                return postJson('/api/maintenance/worktrees/gc', {days, apply: true}).then(() => showToast('Queued: maintenance GC'));
              }}
              onPreview={fetchMaintenance}
              onSetDays={(days) => setMaintenance((cur) => ({...cur, days}))}
            />
            <Toolbar
              activeFilter={activeFilter}
              counts={counts}
              onFilter={setFilter}
              onSort={setSort}
              sort={sort}
              total={worktrees.length}
              visible={visible.length}
            />
            {error ? <div class="error-msg">Error: {error}</div> : null}
            {visible.length ? (
              <div class="grid">
                {visible.map((wt) => (
                  <WorktreeCard
                    key={wt.name}
                    onAction={actions.runAction}
                    onCopy={handleCopy}
                    onDb={actions.openDbModal}
                    onDelete={actions.deleteWorktree}
                    onLogs={actions.openLogs}
                    onResource={actions.openResourceModal}
                    onSelect={setSelectedWt}
                    tasks={tasks}
                    wt={wt}
                  />
                ))}
              </div>
            ) : (
              <div class="center">No worktrees match this filter.</div>
            )}
          </Fragment>
        ) : (
          !error && <div class="center">Loading dashboard...</div>
        )}
        {error && !data && <div class="error-msg">Error: {error}</div>}
      </main>

      {sheetWt && (
        <DetailSheet
          copiedPath={copiedPath}
          onAction={actions.runAction}
          onClose={() => setSelectedWt(null)}
          onCopy={handleCopy}
          onDb={actions.openDbModal}
          onDelete={(name, branch) => { setSelectedWt(null); actions.deleteWorktree(name, branch); }}
          onLogs={actions.openLogs}
          onResource={actions.openResourceModal}
          tasks={tasks}
          wt={sheetWt}
        />
      )}

      <Activity
        collapsed={activityCollapsed}
        hiddenCount={dismissedTaskCount}
        onCancel={cancelTask}
        onClearDone={dismissCompletedTasks}
        onDismiss={dismissTask}
        onRestoreHidden={restoreDismissedTasks}
        onToggle={toggleActivity}
        onToggleTask={toggleTaskCollapsed}
        taskCollapsed={taskCollapsed}
        tasks={activityTasks}
      />

      <div class={`toast${toast ? ' visible' : ''}`}>
        {toast ? <Fragment><span class="toast-dot" />{toast}</Fragment> : null}
      </div>

      <CreateModal
        data={data}
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={(form) =>
          postJson('/api/worktrees', form).then(() => {
            setShowCreate(false);
            showToast(form.startAfterCreate ? `Queued: create ${form.name} and start` : `Queued: create ${form.name}`);
          })
        }
      />
      <DashboardActionModals actions={actions} postJson={postJson} showToast={showToast} />
    </Fragment>
  );
}

render(<App />, document.getElementById('dashboard-root'));
