import {Fragment, h, render} from 'preact';
import {useMemo, useState} from 'preact/hooks';

import {Activity} from './components/activity.jsx';
import {CreateModal} from './components/create-modal.jsx';
import {DbFormModal} from './components/db-form-modal.jsx';
import {Header} from './components/header.jsx';
import {Maintenance} from './components/maintenance.jsx';
import {Modal} from './components/modal.jsx';
import {ResourceExportModal} from './components/resource-export-modal.jsx';
import {Toolbar} from './components/toolbar.jsx';
import {WorktreeCard} from './components/worktree-card.jsx';
import {useDashboardActions} from './lib/dashboard-actions.jsx';
import {classNames, FILTERS, matchesFilter, matchesSearch, priority} from './lib/dashboard-state.js';
import {useDashboardSession} from './lib/dashboard-session.js';
import './styles.css';

function App() {
  const [showCreate, setShowCreate] = useState(false);
  const {
    activeFilter,
    activityCollapsed,
    cardSections,
    cancelTask,
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
  } = useDashboardSession();
  const actions = useDashboardActions({fetchStatus, postJson, showToast});

  const worktrees = useMemo(() => (data?.worktrees || []).slice().sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name)), [data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([key]) => [key, worktrees.filter((wt) => matchesFilter(wt, key)).length])), [worktrees]);
  const visible = worktrees.filter((wt) => matchesFilter(wt, activeFilter) && matchesSearch(wt, searchQuery.toLowerCase()));
  const refreshLabel = error ? 'Error' : data ? `Updated ${new Date(data.refreshedAt).toLocaleTimeString()} - ${countdown}s` : '-';

  return (
    <Fragment>
      <Header cwd={data?.cwd || ''} onDiagnose={() => actions.openDoctor(null)} onNew={() => setShowCreate(true)} onRefresh={fetchStatus} refreshLabel={refreshLabel} />
      <main>
        <div class="layout">
          <section>
            {error ? <div class="error-msg">Error: {error}</div> : null}
            {!data && !error ? <div class="center">Loading dashboard...</div> : null}
            {data ? (
              <div class="dashboard-stack">
                <Toolbar activeFilter={activeFilter} counts={counts} onFilter={setFilter} onSearch={setSearch} query={searchQuery} total={worktrees.length} visible={visible.length} />
                <Maintenance maintenance={maintenance} onApply={(days) => postJson('/api/maintenance/worktrees/gc', {days, apply: true}).then(() => showToast('Queued: maintenance GC'))} onPreview={fetchMaintenance} onSetDays={(days) => setMaintenance((current) => ({...current, days}))} />
                <WorktreeGrid actions={actions} cardSections={cardSections} setSection={setSection} tasks={tasks} visible={visible} />
              </div>
            ) : null}
          </section>
          <Activity collapsed={activityCollapsed} onCancel={cancelTask} onToggle={toggleActivity} tasks={tasks} />
        </div>
      </main>
      <div class={classNames('toast', toast && 'visible')}>{toast}</div>
      <CreateModal data={data} isOpen={showCreate} onClose={() => setShowCreate(false)} onSubmit={(form) => postJson('/api/worktrees', form).then(() => { setShowCreate(false); showToast(`Queued: create ${form.name}`); })} />
      <DbFormModal isOpen={Boolean(actions.dbWorktree)} onClose={actions.closeDbModal} onSubmit={(name, action, payload) => postJson(`/api/worktrees/${encodeURIComponent(name)}/db/${action}`, payload).then(() => { actions.closeDbModal(); showToast(`Queued: DB ${action}`); })} worktreeName={actions.dbWorktree} />
      <ResourceExportModal isOpen={Boolean(actions.resourceWorktree)} onClose={actions.closeResourceModal} onSubmit={(name, resources) => postJson(`/api/worktrees/${encodeURIComponent(name)}/resource/export`, {resources}).then(() => { actions.closeResourceModal(); showToast('Queued: resource export'); })} worktreeName={actions.resourceWorktree} />
      <Modal footer={`${actions.logText.split('\n').filter(Boolean).length} lines`} isOpen={Boolean(actions.logModal)} onClose={actions.closeLogModal} onRefresh={() => actions.logModal && actions.openLogs(actions.logModal.name)} title={actions.logModal ? `${actions.logModal.name} - liferay logs` : 'Logs'}>
        <pre class="log-pre">{actions.logText}</pre>
      </Modal>
      <Modal footer={actions.infoModal?.footer} isOpen={Boolean(actions.infoModal)} onClose={actions.closeInfoModal} title={actions.infoModal?.title || ''}>{actions.infoModal?.body}</Modal>
    </Fragment>
  );
}

function WorktreeGrid({actions, cardSections, setSection, tasks, visible}) {
  if (!visible.length) {
    return <div class="center">No worktrees match this filter.</div>;
  }

  return (
    <div class="grid">
      {visible.map((wt) => (
        <WorktreeCard activeSection={cardSections[wt.name]} key={wt.name} onAction={actions.runAction} onCopy={actions.copyPath} onDb={actions.openDbModal} onDelete={actions.deleteWorktree} onLogs={actions.openLogs} onResource={actions.openResourceModal} onSection={setSection} tasks={tasks} wt={wt} />
      ))}
    </div>
  );
}

render(<App />, document.getElementById('dashboard-root'));
