import {Fragment, h, render} from 'preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';

import {Activity} from './components/activity.jsx';
import {CreateModal} from './components/create-modal.jsx';
import {Header} from './components/header.jsx';
import {Maintenance} from './components/maintenance.jsx';
import {Modal} from './components/modal.jsx';
import {SimpleFormModal} from './components/simple-form-modal.jsx';
import {Toolbar} from './components/toolbar.jsx';
import {WorktreeCard} from './components/worktree-card.jsx';
import {classNames, FILTERS, matchesFilter, matchesSearch, priority} from './lib/dashboard-state.js';
import {readPrefs, writePrefs} from './lib/preferences.js';
import {changedTaskState} from './lib/tasks.js';
import './styles.css';

function App() {
  const prefs = useMemo(readPrefs, []);
  const [activeFilter, setActiveFilter] = useState(prefs.activeFilter || 'all');
  const [activityCollapsed, setActivityCollapsed] = useState(prefs.activityCollapsed ?? true);
  const [cardSections, setCardSections] = useState(prefs.cardSections || {});
  const [countdown, setCountdown] = useState(20);
  const [data, setData] = useState(null);
  const [dbWorktree, setDbWorktree] = useState(null);
  const [error, setError] = useState('');
  const [infoModal, setInfoModal] = useState(null);
  const [logModal, setLogModal] = useState(null);
  const [logText, setLogText] = useState('');
  const [maintenance, setMaintenance] = useState({days: 7, candidates: [], loading: false, error: null});
  const [resourceWorktree, setResourceWorktree] = useState(null);
  const [searchQuery, setSearchQuery] = useState(prefs.searchQuery || '');
  const [showCreate, setShowCreate] = useState(false);
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
    setActiveFilter(filter);
    savePrefs({activeFilter: filter});
  };
  const setSearch = (query) => {
    setSearchQuery(query);
    savePrefs({searchQuery: query});
  };
  const setSection = (name, section) => {
    const next = {...cardSections, [name]: section};
    setCardSections(next);
    savePrefs({cardSections: next});
  };
  const toggleActivity = () => {
    const next = !activityCollapsed;
    setActivityCollapsed(next);
    savePrefs({activityCollapsed: next});
  };

  const openDeployPreview = async (name) => {
    setInfoModal({title: `${name} - Deploy status`, body: <div class="maintenance-empty">Loading deploy status...</div>, footer: 'preview'});
    try {
      const res = await fetch(`/api/worktrees/${encodeURIComponent(name)}/deploy/status`, {cache: 'no-store'});
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      const modules = result.modules || [];
      const active = modules.filter((module) => module.state === 'ACTIVE').length;
      setInfoModal({
        title: `${name} - Deploy status`,
        footer: `${modules.length} modules - ${active} active`,
        body: <DeployPreview active={active} modules={modules} result={result} />,
      });
    } catch (err) {
      setInfoModal((current) => ({...current, body: <div class="log-empty" style={{color: 'var(--red)'}}>Error: {String(err.message || err)}</div>}));
    }
  };

  const runAction = async (name, action, button) => {
    if (action === 'doctor') return openDoctor(name);
    if (action === 'deploy-status') return openDeployPreview(name);
    if (button) button.disabled = true;
    try {
      await postJson(resolveActionUrl(name, action));
      showToast(`Queued: ${action} ${name}`);
      setTimeout(fetchStatus, 400);
    } catch (err) {
      showToast(`Error: ${String(err.message || err)}`);
    } finally {
      if (button) button.disabled = false;
    }
  };

  const openDoctor = async (name) => {
    setInfoModal({title: `${name || 'Repository'} - Diagnose`, body: <div class="maintenance-empty">Loading diagnosis...</div>, footer: 'preview'});
    try {
      const url = name ? `/api/worktrees/${encodeURIComponent(name)}/doctor` : '/api/doctor';
      const res = await fetch(url, {cache: 'no-store'});
      const report = await res.json();
      if (!res.ok) throw new Error(report.error || `HTTP ${res.status}`);
      setInfoModal({
        title: `${name || 'Repository'} - Diagnose`,
        footer: `${report.summary?.failed || 0} failed - ${report.summary?.warned || 0} warned`,
        body: <DoctorPreview name={name} postJson={postJson} report={report} showToast={showToast} />,
      });
    } catch (err) {
      setInfoModal((current) => ({...current, body: <div class="log-empty" style={{color: 'var(--red)'}}>Error: {String(err.message || err)}</div>}));
    }
  };

  const openLogs = async (name) => {
    setLogModal({name});
    setLogText('Loading...');
    try {
      const res = await fetch(`/api/worktrees/${encodeURIComponent(name)}/logs`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setLogText(body.logs || 'No logs available.');
    } catch (err) {
      setLogText(`Error: ${String(err.message || err)}`);
    }
  };

  const copyPath = (path, button) => {
    navigator.clipboard.writeText(path).then(() => {
      button.textContent = 'copied';
      showToast(`Copied: cd ${path}`);
      setTimeout(() => {
        button.textContent = 'copy';
      }, 2000);
    });
  };

  const worktrees = useMemo(() => (data?.worktrees || []).slice().sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name)), [data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([key]) => [key, worktrees.filter((wt) => matchesFilter(wt, key)).length])), [worktrees]);
  const visible = worktrees.filter((wt) => matchesFilter(wt, activeFilter) && matchesSearch(wt, searchQuery.toLowerCase()));
  const refreshLabel = error ? 'Error' : data ? `Updated ${new Date(data.refreshedAt).toLocaleTimeString()} - ${countdown}s` : '-';

  return (
    <Fragment>
      <Header cwd={data?.cwd || ''} onDiagnose={() => openDoctor(null)} onNew={() => setShowCreate(true)} onRefresh={fetchStatus} refreshLabel={refreshLabel} />
      <main>
        <div class="layout">
          <section>
            {error ? <div class="error-msg">Error: {error}</div> : null}
            {!data && !error ? <div class="center">Loading dashboard...</div> : null}
            {data ? (
              <div class="dashboard-stack">
                <Toolbar activeFilter={activeFilter} counts={counts} onFilter={setFilter} onSearch={setSearch} query={searchQuery} total={worktrees.length} visible={visible.length} />
                <Maintenance maintenance={maintenance} onApply={(days) => postJson('/api/maintenance/worktrees/gc', {days, apply: true}).then(() => showToast('Queued: maintenance GC'))} onPreview={fetchMaintenance} onSetDays={(days) => setMaintenance((current) => ({...current, days}))} />
                <WorktreeGrid cardSections={cardSections} copyPath={copyPath} onAction={runAction} onDb={setDbWorktree} onDelete={deleteWorktree} onLogs={openLogs} onResource={setResourceWorktree} setSection={setSection} tasks={tasks} visible={visible} />
              </div>
            ) : null}
          </section>
          <Activity collapsed={activityCollapsed} onToggle={toggleActivity} tasks={tasks} />
        </div>
      </main>
      <div class={classNames('toast', toast && 'visible')}>{toast}</div>
      <CreateModal data={data} isOpen={showCreate} onClose={() => setShowCreate(false)} onSubmit={(form) => postJson('/api/worktrees', form).then(() => { setShowCreate(false); showToast(`Queued: create ${form.name}`); })} />
      <SimpleFormModal isOpen={Boolean(dbWorktree)} onClose={() => setDbWorktree(null)} onSubmit={(name, action, payload) => postJson(`/api/worktrees/${encodeURIComponent(name)}/db/${action}`, payload).then(() => { setDbWorktree(null); showToast(`Queued: DB ${action}`); })} title="DB tools" type="db" worktreeName={dbWorktree} />
      <SimpleFormModal isOpen={Boolean(resourceWorktree)} onClose={() => setResourceWorktree(null)} onSubmit={(name, resources) => postJson(`/api/worktrees/${encodeURIComponent(name)}/resource/export`, {resources}).then(() => { setResourceWorktree(null); showToast('Queued: resource export'); })} title="Resource export" type="resource" worktreeName={resourceWorktree} />
      <Modal footer={`${logText.split('\n').filter(Boolean).length} lines`} isOpen={Boolean(logModal)} onClose={() => setLogModal(null)} onRefresh={() => logModal && openLogs(logModal.name)} title={logModal ? `${logModal.name} - liferay logs` : 'Logs'}>
        <pre class="log-pre">{logText}</pre>
      </Modal>
      <Modal footer={infoModal?.footer} isOpen={Boolean(infoModal)} onClose={() => setInfoModal(null)} title={infoModal?.title || ''}>{infoModal?.body}</Modal>
    </Fragment>
  );

  function deleteWorktree(name) {
    return confirm(`Delete worktree "${name}"?`) && fetch(`/api/worktrees/${encodeURIComponent(name)}`, {method: 'DELETE'}).then(() => showToast(`Delete queued: ${name}`));
  }
}

function WorktreeGrid({cardSections, copyPath, onAction, onDb, onDelete, onLogs, onResource, setSection, tasks, visible}) {
  if (!visible.length) {
    return <div class="center">No worktrees match this filter.</div>;
  }

  return (
    <div class="grid">
      {visible.map((wt) => (
        <WorktreeCard activeSection={cardSections[wt.name]} key={wt.name} onAction={onAction} onCopy={copyPath} onDb={onDb} onDelete={onDelete} onLogs={onLogs} onResource={onResource} onSection={setSection} tasks={tasks} wt={wt} />
      ))}
    </div>
  );
}

function DeployPreview({modules, result}) {
  return (
    <div class="insight-stack">
      <div class="insight-card">
        <div class="insight-label">Last deploy commit</div>
        <div class="insight-value">{result.lastDeployCommit || 'n/a'}</div>
        <div class="insight-sub">{result.lastDeployAt ? new Date(result.lastDeployAt).toLocaleString() : 'No marker yet'}</div>
      </div>
      <div class="insight-card">
        <div class="insight-label">Artifacts</div>
        <div class="insight-list">
          {modules.length ? modules.map((module) => <DeployModule key={`${module.name}-${module.artifact}`} module={module} />) : <div class="maintenance-empty">No deploy artifacts found.</div>}
        </div>
      </div>
    </div>
  );
}

function DeployModule({module}) {
  return (
    <div class="insight-row">
      <div class="insight-row-main">
        <strong>{module.name}</strong>
        <span class="insight-row-meta">{module.artifact || module.source || ''}</span>
      </div>
      <span class={classNames('status-pill', module.state === 'ACTIVE' ? 'status-active' : 'status-deployed')}>{module.state || 'deployed'}</span>
    </div>
  );
}

function DoctorPreview({name, postJson, report, showToast}) {
  const checks = (report.checks || []).filter((check) => check.status === 'warn' || check.status === 'fail');
  return (
    <div class="insight-stack">
      <div class="insight-card">
        <div class="insight-label">Overall</div>
        <div class="insight-value">{report.ok ? 'Ready' : 'Needs fixes'}</div>
      </div>
      <div class="insight-card">
        <div class="insight-label">Actionable checks</div>
        <div class="insight-list">
          {checks.length ? checks.map((check) => <DoctorCheck key={check.id} checkInfo={check} />) : <div class="maintenance-empty">No warnings or failures.</div>}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" type="button" onClick={() => postJson(name ? `/api/worktrees/${encodeURIComponent(name)}/doctor` : '/api/doctor').then(() => showToast('Queued: diagnose'))}>
          Run full diagnose in Activity
        </button>
      </div>
    </div>
  );
}

function DoctorCheck({checkInfo}) {
  return (
    <div class="insight-row">
      <div class="insight-row-main">
        <strong>{checkInfo.id}</strong>
        <span class="insight-row-meta">{checkInfo.summary}</span>
      </div>
      <span class={classNames('status-pill', checkInfo.status === 'fail' ? 'status-fail' : 'status-warn')}>{checkInfo.status}</span>
    </div>
  );
}

function resolveActionUrl(name, action) {
  if (action === 'init-env') return `/api/worktrees/${encodeURIComponent(name)}/env/init`;
  if (action === 'mcp-setup') return `/api/worktrees/${encodeURIComponent(name)}/mcp/setup`;
  if (action === 'deploy-cache-update') return `/api/worktrees/${encodeURIComponent(name)}/deploy/cache-update`;
  if (action === 'restart' || action === 'recreate') return `/api/worktrees/${encodeURIComponent(name)}/env/${action}`;
  return `/api/worktrees/${encodeURIComponent(name)}/${action}`;
}

render(<App />, document.getElementById('dashboard-root'));
