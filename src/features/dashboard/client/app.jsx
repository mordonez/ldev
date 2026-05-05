import {Fragment, h, render} from 'preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';

import './styles.css';

const PREFS_KEY = 'ldev.dashboard.prefs';
const FILTERS = [
  ['all', 'All'],
  ['attention', 'Needs attention'],
  ['running', 'Running'],
  ['dirty', 'Dirty'],
  ['up', 'Up'],
  ['main', 'Main'],
];

function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore private browsing and locked storage.
  }
}

function serviceTone(service) {
  if (service.state === 'running' && (service.health === 'healthy' || !service.health)) return 'green';
  if (service.state === 'running') return 'yellow';
  if (service.state === 'exited' || service.state === 'dead') return 'red';
  return 'gray';
}

function isRunning(wt) {
  return wt.env?.liferay?.state === 'running';
}

function isDirty(wt) {
  return (wt.changedFiles || 0) > 0;
}

function isBehind(wt) {
  return (wt.aheadBehind?.behind || 0) > 0;
}

function needsAttention(wt) {
  if (isDirty(wt) || isBehind(wt)) return true;
  if (!wt.env) return false;
  if (wt.env.portalReachable === false) return true;
  return (wt.env.services || []).some((service) => serviceTone(service) === 'red');
}

function matchesFilter(wt, filter) {
  if (filter === 'attention') return needsAttention(wt);
  if (filter === 'running') return isRunning(wt);
  if (filter === 'dirty') return isDirty(wt);
  if (filter === 'up') return wt.env?.portalReachable === true;
  if (filter === 'main') return wt.isMain;
  return true;
}

function matchesSearch(wt, query) {
  if (!query) return true;
  return [wt.name, wt.path, wt.branch].filter(Boolean).join(' ').toLowerCase().includes(query);
}

function priority(wt) {
  if (needsAttention(wt)) return 0;
  if (isRunning(wt)) return 1;
  if (wt.isMain) return 2;
  return 3;
}

function actionKind(action) {
  if (action === 'init-env') return 'worktree-env-init';
  if (action === 'restart') return 'env-restart';
  if (action === 'recreate') return 'env-recreate';
  if (action === 'deploy-status') return 'deploy-status';
  if (action === 'deploy-cache-update') return 'deploy-cache-update';
  if (action === 'mcp-setup') return 'mcp-setup';
  if (action === 'doctor') return 'doctor';
  return `worktree-${action}`;
}

function taskTime(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function changedTaskState(previous, next) {
  if (previous.length !== next.length) return true;
  return next.some((task, index) => !previous[index] || previous[index].id !== task.id || previous[index].status !== task.status);
}

function Header({cwd, onDiagnose, onNew, onRefresh, refreshLabel}) {
  return (
    <header>
      <div class="logo">
        <span>l</span>dev
      </div>
      <div class="cwd">{cwd}</div>
      <div class="spacer" />
      <button class="header-btn" type="button" onClick={onDiagnose}>
        Diagnose repo
      </button>
      <button class="header-btn" type="button" onClick={onNew}>
        + New worktree
      </button>
      <span class="refresh-pill">{refreshLabel}</span>
      <button class="refresh-btn" type="button" onClick={onRefresh}>
        Refresh
      </button>
    </header>
  );
}

function Activity({collapsed, onToggle, tasks}) {
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

function Toolbar({activeFilter, counts, onFilter, onSearch, query, total, visible}) {
  return (
    <div class="toolbar">
      <div class="toolbar-group">
        {FILTERS.map(([key, label]) => (
          <button class={classNames('filter-chip', activeFilter === key && 'active')} key={key} type="button" onClick={() => onFilter(key)}>
            {label} {counts[key] || 0}
          </button>
        ))}
      </div>
      <div class="toolbar-search">
        <input placeholder="Search worktrees..." value={query} onInput={(event) => onSearch(event.currentTarget.value)} />
      </div>
      <div class="toolbar-meta">
        {visible} of {total}
      </div>
    </div>
  );
}

function Maintenance({maintenance, onApply, onPreview, onSetDays}) {
  return (
    <div class="maintenance">
      <div class="maintenance-header">
        <div>
          <div class="maintenance-title">Maintenance preview</div>
          <div class="maintenance-sub">Find stale worktrees before applying cleanup.</div>
        </div>
      </div>
      <div class="maintenance-controls">
        <input min="1" type="number" value={maintenance.days} onInput={(event) => onSetDays(Number.parseInt(event.currentTarget.value, 10) || 7)} />
        <button class="btn-secondary" type="button" onClick={() => onPreview(maintenance.days)}>
          Preview
        </button>
        <button class="btn-primary" type="button" disabled={maintenance.candidates.length === 0 || maintenance.loading} onClick={() => onApply(maintenance.days)}>
          Apply GC
        </button>
      </div>
      {maintenance.loading ? (
        <div class="maintenance-empty">Loading maintenance preview...</div>
      ) : maintenance.error ? (
        <div class="maintenance-empty">Error: {maintenance.error}</div>
      ) : maintenance.candidates.length ? (
        <div class="maintenance-list">
          {maintenance.candidates.map((candidate) => (
            <span class="maintenance-chip" key={candidate}>
              {candidate}
            </span>
          ))}
        </div>
      ) : (
        <div class="maintenance-empty">No stale worktrees found.</div>
      )}
    </div>
  );
}

function WorktreeCard({activeSection, onAction, onCopy, onDelete, onDb, onLogs, onResource, onSection, tasks, wt}) {
  const running = isRunning(wt);
  const stopped = wt.env && !running;
  const busy = (action) => tasks.some((task) => task.status === 'running' && task.kind === actionKind(action) && task.worktreeName === wt.name);
  const sections = buildSections(wt);
  const selected = sections.find((section) => section.key === activeSection) || sections[0];

  const primary = !wt.env
    ? ['init-env', 'btn-start', 'Init env']
    : running && wt.env.portalReachable === false
      ? ['restart', 'btn-start', 'Restart']
      : stopped
        ? ['start', 'btn-start', 'Start']
        : ['doctor', 'btn-ghost', 'Diagnose'];

  return (
    <div class="card">
      <div class="card-header">
        <div class="card-meta">
          <div class="card-title">
            {wt.name}
            {wt.isMain ? <span class="card-main-label">(main)</span> : null}
          </div>
          <div class="card-branch">{wt.branch || (wt.detached ? 'HEAD detached' : '-')}</div>
        </div>
        <div class="card-badges">
          <div class="card-badge-row">
            {wt.isMain ? <span class="badge badge-blue">main</span> : null}
            {isDirty(wt) ? <span class="badge badge-yellow">{wt.changedFiles} changed</span> : null}
            {running ? <span class="badge badge-green">running</span> : wt.env ? <span class="badge badge-gray">stopped</span> : <span class="badge badge-gray">no env</span>}
            {needsAttention(wt) ? <span class="badge badge-red">attention</span> : null}
          </div>
          {wt.aheadBehind ? (
            <div class="ahead-behind">
              {wt.aheadBehind.ahead ? <span class="ahead">up {wt.aheadBehind.ahead}</span> : null}
              {wt.aheadBehind.behind ? <span class="behind">down {wt.aheadBehind.behind}</span> : null}
              <span>{wt.aheadBehind.base}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div class="path-row">
        <span class="path-text" title={wt.path}>
          {wt.path}
        </span>
        <button class="btn-copy" type="button" onClick={(event) => onCopy(wt.path, event.currentTarget)}>
          copy
        </button>
      </div>
      {wt.env?.portalUrl ? (
        <div class="portal-row">
          <span class={classNames('reach-dot', `dot-${wt.env.portalReachable === false ? 'red' : wt.env.portalReachable === true ? 'green' : 'gray'}`)} />
          <a href={wt.env.portalUrl} rel="noreferrer" target="_blank">
            {wt.env.portalUrl}
          </a>
        </div>
      ) : null}
      {wt.commits?.[0] ? (
        <div class="card-preview-row">
          <span class="card-preview-label">Latest commit</span>
          <div class="commit-preview">
            <span class="chash">{wt.commits[0].hash}</span>
            <span class="commit-preview-subject" title={wt.commits[0].subject}>
              {wt.commits[0].subject}
            </span>
            <span class="card-preview-meta">{wt.commits[0].date}</span>
          </div>
        </div>
      ) : null}
      <div class="actions">
        <button class={classNames('action', primary[1])} type="button" disabled={busy(primary[0])} onClick={(event) => onAction(wt.name, primary[0], event.currentTarget)}>
          {busy(primary[0]) ? '...' : primary[2]}
        </button>
        {primary[0] !== 'start' && !running ? (
          <button class="action btn-start" type="button" disabled={busy('start')} onClick={(event) => onAction(wt.name, 'start', event.currentTarget)}>
            {busy('start') ? '...' : 'Start'}
          </button>
        ) : null}
        {wt.env && !stopped ? (
          <button class="action btn-stop" type="button" disabled={busy('stop')} onClick={(event) => onAction(wt.name, 'stop', event.currentTarget)}>
            {busy('stop') ? '...' : 'Stop'}
          </button>
        ) : null}
        {wt.env?.liferay ? (
          <button class="action btn-logs" type="button" onClick={() => onLogs(wt.name)}>
            Logs
          </button>
        ) : null}
        <button class="action btn-ghost" type="button" onClick={() => onDb(wt.name)}>
          DB
        </button>
        <button class="action btn-ghost" type="button" onClick={() => onResource(wt.name)}>
          Resource export
        </button>
        <button class="action btn-ghost" type="button" disabled={busy('mcp-setup')} onClick={(event) => onAction(wt.name, 'mcp-setup', event.currentTarget)}>
          {busy('mcp-setup') ? '...' : 'MCP setup'}
        </button>
        {wt.env ? (
          <Fragment>
            <button class="action btn-ghost" type="button" disabled={busy('deploy-status')} onClick={(event) => onAction(wt.name, 'deploy-status', event.currentTarget)}>
              Deploy status
            </button>
            <button class="action btn-ghost" type="button" disabled={busy('deploy-cache-update')} onClick={(event) => onAction(wt.name, 'deploy-cache-update', event.currentTarget)}>
              {busy('deploy-cache-update') ? '...' : 'Cache update'}
            </button>
            <button class="action btn-ghost" type="button" disabled={busy('recreate')} onClick={(event) => onAction(wt.name, 'recreate', event.currentTarget)}>
              {busy('recreate') ? '...' : 'Recreate'}
            </button>
          </Fragment>
        ) : null}
        <div class="actions-spacer" />
        {!wt.isMain ? (
          <button class="btn-delete" type="button" onClick={() => onDelete(wt.name)}>
            Delete
          </button>
        ) : null}
      </div>
      {selected ? (
        <div class="card-panel-stack">
          <div class="card-panel">
            <div class="card-panel-header">
              <div class="card-panel-title">Workspace details</div>
              <div class="card-chip-row">
                {sections.map((section) => (
                  <button class={classNames('card-chip', section.tone && `card-chip-${section.tone}`, selected.key === section.key && 'active')} key={section.key} type="button" onClick={() => onSection(wt.name, section.key)}>
                    {section.label}
                    {section.count ? <span class="card-chip-count"> - {section.count}</span> : null}
                  </button>
                ))}
              </div>
            </div>
            {selected.content}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildSections(wt) {
  const sections = [];
  const changedPaths = Array.isArray(wt.changedPaths) ? wt.changedPaths.filter(Boolean) : [];
  if (changedPaths.length) {
    sections.push({
      key: 'changes',
      label: 'Changes',
      count: String(wt.changedFiles),
      tone: 'yellow',
      content: (
        <div class="detail-section">
          <div class="changed-files">
            {changedPaths.slice(0, 8).map((changedPath) => (
              <div class="changed-file" key={changedPath}>
                <span class="changed-file-path">{changedPath}</span>
              </div>
            ))}
            {changedPaths.length > 8 ? <div class="changed-file-more">+{changedPaths.length - 8} more files</div> : null}
          </div>
        </div>
      ),
    });
  }
  if (wt.env?.services?.length) {
    sections.push({
      key: 'services',
      label: 'Services',
      count: String(wt.env.services.length),
      tone: wt.env.services.some((service) => serviceTone(service) === 'red') ? 'red' : 'green',
      content: (
        <div class="detail-section">
          <div class="services">
            {wt.env.services.map((service) => (
              <span class="svc" key={service.name}>
                <span class={classNames('dot', `dot-${serviceTone(service)}`)} />
                {service.name}: {service.state || service.health || 'unknown'}
              </span>
            ))}
          </div>
        </div>
      ),
    });
  }
  if (wt.commits?.length) {
    sections.push({
      key: 'commits',
      label: 'Commits',
      count: wt.changedFiles > 0 ? `${wt.changedFiles} pending` : String(wt.commits.length),
      tone: wt.changedFiles > 0 ? 'yellow' : 'blue',
      content: (
        <div class="commits">
          <div class="commits-header">
            <span class="commits-label">Commits</span>
            {wt.changedFiles > 0 ? <span class="changed">{wt.changedFiles} changed</span> : null}
          </div>
          {wt.commits.map((commit) => (
            <div class="commit" key={`${commit.hash}-${commit.subject}`}>
              <span class="chash">{commit.hash}</span>
              <span class="csubject" title={commit.subject}>
                {commit.subject}
              </span>
              <span class="cdate">{commit.date}</span>
            </div>
          ))}
        </div>
      ),
    });
  }
  return sections;
}

function Modal({children, footer, isOpen, onClose, onRefresh, subtitle, title}) {
  if (!isOpen) return null;
  return (
    <div class="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{title}</span>
          <span class="modal-subtitle">{subtitle || ''}</span>
          <button class="modal-close" type="button" onClick={onClose}>
            x
          </button>
        </div>
        <div class="modal-body">{children}</div>
        <div class="modal-footer">
          <span class="log-info">{footer || ''}</span>
          {onRefresh ? (
            <button class="btn-refresh-logs" type="button" onClick={onRefresh}>
              Refresh
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SimpleFormModal({isOpen, onClose, onSubmit, title, worktreeName, type}) {
  const [selected, setSelected] = useState({templates: true, structures: true, adts: true, fragments: true});
  const [dbAction, setDbAction] = useState('download');
  const [form, setForm] = useState({environment: '', file: '', force: true, query: ''});
  if (!isOpen) return null;

  const submit = (event) => {
    event.preventDefault();
    if (type === 'resource') {
      onSubmit(
        worktreeName,
        Object.entries(selected)
          .filter(([, value]) => value)
          .map(([key]) => key),
      );
      return;
    }
    onSubmit(worktreeName, dbAction, form);
  };

  return (
    <div class="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div class="modal" style={{maxWidth: type === 'db' ? '620px' : '560px', maxHeight: 'none', alignSelf: 'center'}}>
        <div class="modal-header">
          <span class="modal-title">{title}</span>
          <span class="modal-subtitle">{worktreeName}</span>
          <button class="modal-close" type="button" onClick={onClose}>
            x
          </button>
        </div>
        <div class="modal-body">
          <form class="create-form" onSubmit={submit}>
            {type === 'resource' ? (
              <Fragment>
                <div class="field-hint">Export the selected resources for all accessible sites in this environment.</div>
                {Object.keys(selected).map((kind) => (
                  <label class="checkbox-row" key={kind}>
                    <input checked={selected[kind]} type="checkbox" onChange={(event) => setSelected((current) => ({...current, [kind]: event.currentTarget.checked}))} />
                    <span>{kind[0].toUpperCase() + kind.slice(1)}</span>
                  </label>
                ))}
              </Fragment>
            ) : (
              <Fragment>
                <div class="segmented">
                  {['download', 'sync', 'import', 'query'].map((action) => (
                    <button class={classNames('segmented-btn', dbAction === action && 'active')} key={action} type="button" onClick={() => setDbAction(action)}>
                      {action[0].toUpperCase() + action.slice(1)}
                    </button>
                  ))}
                </div>
                {dbAction === 'download' || dbAction === 'sync' ? (
                  <div class="field">
                    <label>Environment (Liferay Cloud)</label>
                    <input placeholder="prd" value={form.environment} onInput={(event) => setForm((current) => ({...current, environment: event.currentTarget.value}))} />
                  </div>
                ) : null}
                {dbAction === 'import' || dbAction === 'query' ? (
                  <div class="field">
                    <label>File path</label>
                    <input placeholder="Optional path to .sql/.gz/.dump" value={form.file} onInput={(event) => setForm((current) => ({...current, file: event.currentTarget.value}))} />
                  </div>
                ) : null}
                {dbAction === 'query' ? (
                  <div class="field">
                    <label>SQL query</label>
                    <textarea placeholder="select current_database();" value={form.query} onInput={(event) => setForm((current) => ({...current, query: event.currentTarget.value}))} />
                  </div>
                ) : null}
              </Fragment>
            )}
            <div class="create-actions">
              <button class="btn-secondary" type="button" onClick={onClose}>
                Cancel
              </button>
              <button class="btn-primary" type="submit">
                {type === 'resource' ? 'Export selected' : `Run ${dbAction}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function CreateModal({data, isOpen, onClose, onSubmit}) {
  const mainBranch = data?.worktrees?.find((wt) => wt.isMain)?.branch || '';
  const [form, setForm] = useState({name: '', baseRef: '', withEnv: true, stopMainForClone: true, restartMainAfterClone: false});
  useEffect(() => {
    if (isOpen) setForm({name: '', baseRef: mainBranch, withEnv: true, stopMainForClone: true, restartMainAfterClone: false});
  }, [isOpen, mainBranch]);
  if (!isOpen) return null;
  const update = (key, value) => setForm((current) => ({...current, [key]: value}));
  return (
    <div class="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div class="modal" style={{maxWidth: '560px', maxHeight: 'none', alignSelf: 'center'}}>
        <div class="modal-header">
          <span class="modal-title">New worktree</span>
          <button class="modal-close" type="button" onClick={onClose}>
            x
          </button>
        </div>
        <div class="modal-body">
          <form class="create-form" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
            <div class="field">
              <label>Worktree name</label>
              <input required placeholder="feature-short-name" value={form.name} onInput={(event) => update('name', event.currentTarget.value)} />
              <div class="field-hint">This becomes .worktrees/&lt;name&gt; and the default branch fix/&lt;name&gt;.</div>
            </div>
            <div class="field">
              <label>Base ref</label>
              <input placeholder="HEAD (optional)" value={form.baseRef} onInput={(event) => update('baseRef', event.currentTarget.value)} />
            </div>
            {[
              ['withEnv', 'Prepare an isolated local environment for this worktree'],
              ['stopMainForClone', 'Stop the main environment during non-Btrfs state cloning when needed'],
              ['restartMainAfterClone', 'Restart the main environment after cloning so both runtimes can keep running'],
            ].map(([key, label]) => (
              <label class="checkbox-row" key={key}>
                <input checked={form[key]} type="checkbox" onChange={(event) => update(key, event.currentTarget.checked)} />
                <span>{label}</span>
              </label>
            ))}
            <div class="create-actions">
              <button class="btn-secondary" type="button" onClick={onClose}>
                Cancel
              </button>
              <button class="btn-primary" type="submit">
                Create worktree
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

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
        body: (
          <div class="insight-stack">
            <div class="insight-card">
              <div class="insight-label">Last deploy commit</div>
              <div class="insight-value">{result.lastDeployCommit || 'n/a'}</div>
              <div class="insight-sub">{result.lastDeployAt ? new Date(result.lastDeployAt).toLocaleString() : 'No marker yet'}</div>
            </div>
            <div class="insight-card">
              <div class="insight-label">Artifacts</div>
              <div class="insight-list">
                {modules.length ? (
                  modules.map((module) => (
                    <div class="insight-row" key={`${module.name}-${module.artifact}`}>
                      <div class="insight-row-main">
                        <strong>{module.name}</strong>
                        <span class="insight-row-meta">{module.artifact || module.source || ''}</span>
                      </div>
                      <span class={classNames('status-pill', module.state === 'ACTIVE' ? 'status-active' : 'status-deployed')}>{module.state || 'deployed'}</span>
                    </div>
                  ))
                ) : (
                  <div class="maintenance-empty">No deploy artifacts found.</div>
                )}
              </div>
            </div>
          </div>
        ),
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
      const actionUrl =
        action === 'init-env'
          ? `/api/worktrees/${encodeURIComponent(name)}/env/init`
          : action === 'mcp-setup'
            ? `/api/worktrees/${encodeURIComponent(name)}/mcp/setup`
            : action === 'deploy-cache-update'
              ? `/api/worktrees/${encodeURIComponent(name)}/deploy/cache-update`
          : action === 'restart' || action === 'recreate'
            ? `/api/worktrees/${encodeURIComponent(name)}/env/${action}`
            : `/api/worktrees/${encodeURIComponent(name)}/${action}`;
      await postJson(actionUrl);
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
      const checks = (report.checks || []).filter((check) => check.status === 'warn' || check.status === 'fail');
      setInfoModal({
        title: `${name || 'Repository'} - Diagnose`,
        footer: `${report.summary?.failed || 0} failed - ${report.summary?.warned || 0} warned`,
        body: (
          <div class="insight-stack">
            <div class="insight-card">
              <div class="insight-label">Overall</div>
              <div class="insight-value">{report.ok ? 'Ready' : 'Needs fixes'}</div>
            </div>
            <div class="insight-card">
              <div class="insight-label">Actionable checks</div>
              <div class="insight-list">
                {checks.length ? checks.map((check) => <div class="insight-row" key={check.id}><div class="insight-row-main"><strong>{check.id}</strong><span class="insight-row-meta">{check.summary}</span></div><span class={classNames('status-pill', check.status === 'fail' ? 'status-fail' : 'status-warn')}>{check.status}</span></div>) : <div class="maintenance-empty">No warnings or failures.</div>}
              </div>
            </div>
            <div class="modal-actions"><button class="btn-secondary" type="button" onClick={() => postJson(name ? `/api/worktrees/${encodeURIComponent(name)}/doctor` : '/api/doctor').then(() => showToast('Queued: diagnose'))}>Run full diagnose in Activity</button></div>
          </div>
        ),
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
                {visible.length ? (
                  <div class="grid">
                    {visible.map((wt) => (
                      <WorktreeCard activeSection={cardSections[wt.name]} key={wt.name} onAction={runAction} onCopy={copyPath} onDb={setDbWorktree} onDelete={(name) => confirm(`Delete worktree "${name}"?`) && fetch(`/api/worktrees/${encodeURIComponent(name)}`, {method: 'DELETE'}).then(() => showToast(`Delete queued: ${name}`))} onLogs={openLogs} onResource={setResourceWorktree} onSection={setSection} tasks={tasks} wt={wt} />
                    ))}
                  </div>
                ) : (
                  <div class="center">No worktrees match this filter.</div>
                )}
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
}

render(<App />, document.getElementById('dashboard-root'));
