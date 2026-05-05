var lastData = null;
var countdown = 0;
var pollTimer = null;
var currentLogsWorktree = null;
var toastTimer = null;
var taskSource = null;
var logStreamController = null;
var logStreamLineCount = 0;
var logStreamChunks = [];
var logStreamCharCount = 0;
var taskState = {tasks: []};
var activeFilter = 'all';
var activityCollapsed = true;
var searchQuery = '';
var cardSectionByName = {};
var DASHBOARD_PREFS_KEY = 'ldev.dashboard.prefs';
var currentDbWorktree = null;
var currentDbAction = 'download';
var currentResourceWorktree = null;
var maintenanceState = {days: 7, candidates: [], loading: false, error: null};
var modalState = {mode: null, target: null};
var LOG_STREAM_MAX_CHARS = 120000;

var FILTER_CONFIG = [
  {key: 'all', label: 'All'},
  {key: 'attention', label: 'Needs attention'},
  {key: 'running', label: 'Running'},
  {key: 'dirty', label: 'Dirty'},
  {key: 'up', label: 'Up'},
  {key: 'main', label: 'Main'}
];

function setModalOpen(overlayId, isOpen) {
  var overlay = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.classList.toggle('hidden', !isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function readDashboardPrefs() {
  try {
    var raw = window.localStorage.getItem(DASHBOARD_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeDashboardPrefs() {
  try {
    window.localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify({
      activeFilter: activeFilter,
      activityCollapsed: activityCollapsed,
      searchQuery: searchQuery,
      cardSections: cardSectionByName,
    }));
  } catch (e) {
    // Ignore storage failures and keep the dashboard functional.
  }
}

function loadDashboardPrefs() {
  var prefs = readDashboardPrefs();
  if (!prefs) {
    return;
  }

  var validFilter = FILTER_CONFIG.some(function(filter) { return filter.key === prefs.activeFilter; });
  if (validFilter) {
    activeFilter = prefs.activeFilter;
  }

  if (typeof prefs.activityCollapsed === 'boolean') {
    activityCollapsed = prefs.activityCollapsed;
  }

  if (typeof prefs.searchQuery === 'string') {
    searchQuery = prefs.searchQuery;
  }

  if (prefs.cardSections && typeof prefs.cardSections === 'object') {
    Object.keys(prefs.cardSections).forEach(function(name) {
      if (typeof prefs.cardSections[name] === 'string') {
        cardSectionByName[name] = prefs.cardSections[name];
      }
    });
  }
}

function rememberCardSection(name, sectionKey) {
  if (!name || !sectionKey) {
    return;
  }

  cardSectionByName[name] = sectionKey;
  writeDashboardPrefs();
}

function getCardSectionKey(name, sections, fallbackKey) {
  var stored = cardSectionByName[name];
  var active = sections.some(function(section) { return section.key === stored; }) ? stored : fallbackKey;
  if (name && active && cardSectionByName[name] !== active) {
    cardSectionByName[name] = active;
  }
  return active;
}

function renderCardSectionTabs(name, sections, activeKey) {
  return '<div class="card-chip-row">' + sections.map(function(section) {
    var active = section.key === activeKey ? ' active' : '';
    var tone = section.tone ? ' card-chip-' + section.tone : '';
    var count = section.countLabel ? '<span class="card-chip-count"> · ' + esc(String(section.countLabel)) + '</span>' : '';
    return '<button type="button" class="card-chip' + tone + active + '" data-name="' + esc(name) + '" data-card-section="' + esc(section.key) + '">' + esc(section.label) + count + '</button>';
  }).join('') + '</div>';
}

function prioritizeCardSections(sections) {
  return sections.slice().sort(function(a, b) {
    if ((a.priority || 0) !== (b.priority || 0)) {
      return (a.priority || 0) - (b.priority || 0);
    }

    return a.label.localeCompare(b.label);
  });
}

function renderCardSections(name, sections, activeKey) {
  if (!sections.length) {
    return '';
  }

  var orderedSections = prioritizeCardSections(sections);
  var activeSection = orderedSections.find(function(section) { return section.key === activeKey; }) || orderedSections[0];
  return '<div class="card-panel">' +
    '<div class="card-panel-header">' +
      '<div class="card-panel-title">Workspace details</div>' +
      renderCardSectionTabs(name, orderedSections, activeSection.key) +
    '</div>' +
    activeSection.content +
  '</div>';
}

function summarizeServiceHealth(services) {
  return (services || []).reduce(function(summary, service) {
    var tone = svcDotClass(service.state, service.health);
    summary.total++;
    if (tone === 'red') {
      summary.failed++;
    } else if (tone === 'yellow') {
      summary.warned++;
    } else if (tone === 'green') {
      summary.healthy++;
    } else {
      summary.unknown++;
    }
    return summary;
  }, {total: 0, healthy: 0, warned: 0, failed: 0, unknown: 0});
}

function buildServicesSection(servicesMarkup, serviceSummary, isRunning) {
  var tone = 'blue';
  var countLabel = String(serviceSummary.total);
  var priority = 30;

  if (serviceSummary.failed > 0) {
    tone = 'red';
    countLabel = String(serviceSummary.failed) + ' down';
    priority = 5;
  } else if (serviceSummary.warned > 0) {
    tone = 'yellow';
    countLabel = String(serviceSummary.warned) + ' warn';
    priority = 10;
  } else if (isRunning && serviceSummary.total > 0) {
    tone = 'green';
    countLabel = String(serviceSummary.healthy) + ' up';
    priority = 0;
  }

  return {
    key: 'services',
    label: 'Services',
    countLabel: countLabel,
    tone: tone,
    priority: priority,
    content: '<div class="detail-section">' + servicesMarkup + '</div>'
  };
}

function buildCommitsSection(commitsMarkup, commitCount, changedFiles) {
  return {
    key: 'commits',
    label: 'Commits',
    countLabel: changedFiles > 0 ? String(changedFiles) + ' pending' : String(commitCount),
    tone: changedFiles > 0 ? 'yellow' : 'blue',
    priority: changedFiles > 0 ? 0 : 20,
    content: '<div class="detail-section">' + commitsMarkup + '</div>'
  };
}

function buildChangesSection(changedPaths, changedFiles) {
  var visiblePaths = changedPaths.slice(0, 8);
  var remaining = Math.max(0, changedPaths.length - visiblePaths.length);
  var rows = visiblePaths.map(function(changedPath) {
    return '<div class="changed-file"><span class="changed-file-path">' + esc(changedPath) + '</span></div>';
  }).join('');
  var more = remaining > 0 ? '<div class="changed-file-more">+' + remaining + ' more files</div>' : '';

  return {
    key: 'changes',
    label: 'Changes',
    countLabel: String(changedFiles),
    tone: 'yellow',
    priority: 0,
    content: '<div class="detail-section"><div class="changed-files">' + rows + more + '</div></div>'
  };
}

function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('visible'); }, 2000);
}

function formatTaskTime(value) {
  var date = new Date(value);
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0') + ':' + String(date.getSeconds()).padStart(2, '0');
}

function taskStatusLabel(status) {
  if (status === 'running') return 'running';
  if (status === 'succeeded') return 'done';
  return 'failed';
}

function shouldRefreshFromTasks(previousTasks, nextTasks) {
  if (previousTasks.length !== nextTasks.length) {
    return true;
  }

  for (var i = 0; i < nextTasks.length; i++) {
    if (!previousTasks[i] || previousTasks[i].id !== nextTasks[i].id || previousTasks[i].status !== nextTasks[i].status) {
      return true;
    }
  }

  return false;
}

function stopLogStream() {
  if (logStreamController) {
    logStreamController.abort();
    logStreamController = null;
  }
}

function prepareLogStreamBody() {
  var body = document.getElementById('modal-body');
  body.innerHTML = '<pre class="log-pre" id="modal-log-stream"></pre>';
  return document.getElementById('modal-log-stream');
}

function updateLogInfo(extra) {
  var info = document.getElementById('modal-info');
  if (!info) return;

  var parts = [logStreamLineCount + ' lines', 'live'];
  if (extra) {
    parts.push(extra);
  }
  parts.push(new Date().toLocaleTimeString());
  info.textContent = parts.join(' · ');
}

function setModalRefreshLabel(label) {
  var refreshBtn = document.getElementById('modal-refresh');
  if (refreshBtn) {
    refreshBtn.textContent = label || '⟳ Refresh';
  }
}

function openInfoModal(title, subtitle, bodyHtml, footerInfo, refreshLabel, state) {
  modalState = state || {mode: null, target: null};
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-subtitle').textContent = subtitle || '';
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-info').textContent = footerInfo || '';
  setModalRefreshLabel(refreshLabel || '⟳ Refresh');
  setModalOpen('modal-overlay', true);
}

function doctorStatusClass(status) {
  return 'status-' + (status || 'skip');
}

function renderDoctorPreview(report, worktreeName) {
  var readinessEntries = Object.keys(report.readiness || {}).map(function(key) {
    return '<div class="insight-row"><div class="insight-row-main"><strong>' + esc(key) + '</strong></div><span class="status-pill ' + doctorStatusClass(report.readiness[key] === 'ready' ? 'pass' : report.readiness[key] === 'blocked' ? 'fail' : 'skip') + '">' + esc(report.readiness[key]) + '</span></div>';
  }).join('');
  var actionableChecks = (report.checks || []).filter(function(check) { return check.status === 'warn' || check.status === 'fail'; }).map(function(check) {
    return '<div class="insight-row"><div class="insight-row-main"><strong>' + esc(check.id) + '</strong><span class="insight-row-meta">' + esc(check.summary || '') + '</span>' + (check.remedy ? '<span class="insight-row-meta">' + esc(check.remedy) + '</span>' : '') + '</div><span class="status-pill ' + doctorStatusClass(check.status) + '">' + esc(check.status) + '</span></div>';
  }).join('');
  var runtimeSummary = report.runtime ? report.runtime.summary : 'Runtime probe not available';
  var portalSummary = report.portal ? report.portal.summary : 'Portal probe not available';

  return '<div class="insight-stack">' +
    '<div class="insight-grid">' +
      '<div class="insight-card"><div class="insight-label">Overall</div><div class="insight-value">' + (report.ok ? 'Ready' : 'Needs fixes') + '</div><div class="insight-sub">' + esc((report.summary.passed || 0) + ' passed · ' + (report.summary.warned || 0) + ' warned · ' + (report.summary.failed || 0) + ' failed') + '</div></div>' +
      '<div class="insight-card"><div class="insight-label">Runtime</div><div class="insight-value">' + esc(runtimeSummary) + '</div><div class="insight-sub">Portal: ' + esc(portalSummary) + '</div></div>' +
      '<div class="insight-card"><div class="insight-label">Target</div><div class="insight-value">' + esc(worktreeName || 'repo') + '</div><div class="insight-sub">Generated ' + esc(new Date(report.generatedAt).toLocaleTimeString()) + '</div></div>' +
    '</div>' +
    '<div class="insight-card"><div class="insight-label">Readiness lanes</div><div class="insight-list">' + (readinessEntries || '<div class="maintenance-empty">No readiness data</div>') + '</div></div>' +
    '<div class="insight-card"><div class="insight-label">Actionable checks</div><div class="insight-list">' + (actionableChecks || '<div class="maintenance-empty">No warnings or failures.</div>') + '</div></div>' +
    '<div class="modal-actions"><button class="btn-secondary" type="button" id="modal-run-task">Run full diagnose in Activity</button></div>' +
  '</div>';
}

function renderDeployPreview(result, worktreeName) {
  var activeCount = (result.modules || []).filter(function(module) { return module.state === 'ACTIVE'; }).length;
  var deployedCount = (result.modules || []).length - activeCount;
  var modules = (result.modules || []).map(function(module) {
    return '<div class="insight-row"><div class="insight-row-main"><strong>' + esc(module.name) + '</strong><span class="insight-row-meta">' + esc(module.artifact) + ' · ' + esc(module.source) + '</span></div><span class="status-pill ' + (module.state === 'ACTIVE' ? 'status-active' : 'status-deployed') + '">' + esc(module.state) + '</span></div>';
  }).join('');

  return '<div class="insight-stack">' +
    '<div class="insight-grid">' +
      '<div class="insight-card"><div class="insight-label">Modules</div><div class="insight-value">' + esc(String((result.modules || []).length)) + '</div><div class="insight-sub">' + esc(activeCount + ' active · ' + deployedCount + ' deployed') + '</div></div>' +
      '<div class="insight-card"><div class="insight-label">Last deploy commit</div><div class="insight-value">' + esc(result.lastDeployCommit || 'n/a') + '</div><div class="insight-sub">' + esc(result.lastDeployAt ? new Date(result.lastDeployAt).toLocaleString() : 'No marker yet') + '</div></div>' +
      '<div class="insight-card"><div class="insight-label">Target</div><div class="insight-value">' + esc(worktreeName) + '</div><div class="insight-sub">Build: ' + esc(result.buildDeployDir) + '</div></div>' +
    '</div>' +
    '<div class="insight-card"><div class="insight-label">Artifacts</div><div class="insight-list">' + (modules || '<div class="maintenance-empty">No deploy artifacts found.</div>') + '</div></div>' +
    '<div class="modal-note">Cache dir: ' + esc(result.cacheDir) + '</div>' +
  '</div>';
}

function appendLogChunk(chunk) {
  var body = document.getElementById('modal-body');
  var pre = document.getElementById('modal-log-stream');
  if (!pre) {
    pre = prepareLogStreamBody();
  }

  var stickToBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 32;
  logStreamChunks.push(chunk);
  logStreamCharCount += chunk.length;
  logStreamLineCount += chunk.split('\\n').filter(Boolean).length;

  while (logStreamCharCount > LOG_STREAM_MAX_CHARS && logStreamChunks.length > 1) {
    var removed = logStreamChunks.shift() || '';
    logStreamCharCount -= removed.length;
    logStreamLineCount = Math.max(0, logStreamLineCount - removed.split('\\n').filter(Boolean).length);
  }

  pre.textContent = logStreamChunks.join('');
  if (stickToBottom) {
    body.scrollTop = body.scrollHeight;
  }
  updateLogInfo();
}

function handleLogStreamMessage(message) {
  if (message.type === 'meta') {
    document.getElementById('modal-subtitle').textContent = message.containerId ? message.containerId.slice(0, 12) : '';
    updateLogInfo(message.running ? 'connected' : 'container stopped');
    return;
  }

  if (message.type === 'chunk') {
    appendLogChunk(message.chunk || '');
    return;
  }

  if (message.type === 'error') {
    appendLogChunk('\\n[dashboard] ' + (message.message || 'Log stream failed') + '\\n');
    updateLogInfo('stream error');
    return;
  }

  if (message.type === 'end') {
    updateLogInfo('stream ended');
  }
}

async function startLogStream(worktreeName) {
  stopLogStream();
  logStreamController = new AbortController();
  logStreamLineCount = 0;
  logStreamChunks = [];
  logStreamCharCount = 0;
  prepareLogStreamBody();
  updateLogInfo('connecting');

  try {
    var res = await fetch('/api/worktrees/' + encodeURIComponent(worktreeName) + '/logs/stream', {
      signal: logStreamController.signal,
      cache: 'no-store'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    if (!res.body) throw new Error('Readable stream not available');

    var reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    var buffer = '';

    while (true) {
      var result = await reader.read();
      if (result.done) {
        break;
      }

      buffer += result.value;
  var lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (var i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        handleLogStreamMessage(JSON.parse(lines[i]));
      }
    }

    if (buffer.trim()) {
      handleLogStreamMessage(JSON.parse(buffer));
    }
  } catch(e) {
    if (e.name === 'AbortError') {
      return;
    }

    document.getElementById('modal-body').innerHTML = '<div class="log-empty" style="color:var(--red)">Error: ' + esc(String(e.message)) + '</div>';
    updateLogInfo('stream failed');
  }
}

function renderTasks(payload) {
  taskState = payload || {tasks: []};
  var tasks = taskState.tasks || [];
  var listEl = document.getElementById('task-list');
  var summaryEl = document.getElementById('task-summary');
  var activeCount = tasks.filter(function(task) { return task.status === 'running'; }).length;
  if (tasks.length > 0) {
    activityCollapsed = false;
  }
  summaryEl.textContent = activeCount > 0 ? activeCount + ' active task' + (activeCount === 1 ? '' : 's') : (tasks.length > 0 ? 'No active tasks' : 'No activity yet');

  if (tasks.length === 0) {
    listEl.innerHTML = '<div class="task-empty">Long-running actions will stream here.</div>';
    applyActivityState();
    return;
  }

  listEl.innerHTML = tasks.map(function(task) {
    var logs = (task.logs || []).map(function(entry) {
      return '<div class="task-line ' + entry.level + '"><span class="task-time">' + formatTaskTime(entry.timestamp) + '</span><span class="task-msg">' + esc(entry.message) + '</span></div>';
    }).join('');
    var sub = [task.worktreeName || task.kind, 'started ' + formatTaskTime(task.startedAt)].join(' · ');
    return '<article class="task-card ' + task.status + '">' +
      '<div class="task-head">' +
        '<div><div class="task-title">' + esc(task.label) + '</div><div class="task-sub">' + esc(sub) + '</div></div>' +
        '<span class="task-status ' + task.status + '">' + taskStatusLabel(task.status) + '</span>' +
      '</div>' +
      '<div class="task-log">' + logs + '</div>' +
    '</article>';
  }).join('');
  applyActivityState();
}

function applyActivityState() {
  var panel = document.getElementById('activity-panel');
  var toggle = document.getElementById('activity-toggle');
  if (!panel || !toggle) {
    return;
  }

  panel.classList.toggle('is-collapsed', activityCollapsed);
  toggle.textContent = activityCollapsed ? 'Show' : 'Hide';
  toggle.setAttribute('aria-expanded', activityCollapsed ? 'false' : 'true');
  writeDashboardPrefs();
}

async function fetchTasks() {
  try {
    var res = await fetch('/api/tasks');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    renderTasks(await res.json());
  } catch (e) {
    console.error(e);
  }
}

function connectTaskStream() {
  if (taskSource) {
    taskSource.close();
  }

  taskSource = new EventSource('/api/tasks/stream');
  taskSource.onmessage = function(event) {
    var previous = taskState.tasks || [];
    var next = JSON.parse(event.data);
    renderTasks(next);
    if (shouldRefreshFromTasks(previous, next.tasks || [])) {
      fetchStatus();
    }
  };
  taskSource.onerror = function() {
    if (taskSource) {
      taskSource.close();
      taskSource = null;
    }
    setTimeout(connectTaskStream, 1500);
  };
}

function updateCreateOptions() {
  var withEnv = document.getElementById('create-with-env');
  var stopMain = document.getElementById('create-stop-main');
  var restartMain = document.getElementById('create-restart-main');
  var enabled = withEnv.checked;

  stopMain.disabled = !enabled;
  restartMain.disabled = !enabled || !stopMain.checked;

  if (!enabled) {
    stopMain.checked = false;
    restartMain.checked = false;
    return;
  }

  if (!stopMain.checked) {
    restartMain.checked = false;
  }
}

function openCreateModal() {
  document.getElementById('create-error').textContent = '';
  document.getElementById('create-base').value = getDefaultCreateBaseRef();
  setModalOpen('create-overlay', true);
  setTimeout(function() {
    document.getElementById('create-name').focus();
  }, 0);
}

function getDefaultCreateBaseRef() {
  var worktrees = lastData && lastData.worktrees ? lastData.worktrees : [];
  for (var i = 0; i < worktrees.length; i++) {
    if (worktrees[i].isMain && worktrees[i].branch) {
      return worktrees[i].branch;
    }
  }

  return '';
}

function closeCreateModal() {
  var form = document.getElementById('create-form');
  form.reset();
  document.getElementById('create-error').textContent = '';
  updateCreateOptions();
  setModalOpen('create-overlay', false);
}

function setDbAction(action) {
  currentDbAction = action;
  document.querySelectorAll('[data-db-action]').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-db-action') === action);
  });

  var environmentField = document.getElementById('db-environment-field');
  var fileField = document.getElementById('db-file-field');
  var forceRow = document.getElementById('db-force-row');
  var queryField = document.getElementById('db-query-field');
  var submitBtn = document.getElementById('db-submit');
  var fileHint = document.getElementById('db-file-hint');
  var forceLabel = document.getElementById('db-force-label');

  environmentField.classList.toggle('hidden', action !== 'download' && action !== 'sync');
  fileField.classList.toggle('hidden', action !== 'import' && action !== 'query');
  forceRow.classList.toggle('hidden', action !== 'sync' && action !== 'import');
  queryField.classList.toggle('hidden', action !== 'query');

  if (action === 'import') {
    fileHint.textContent = 'Optional. Leave empty to import the newest backup from docker/backups.';
    forceLabel.textContent = 'Force overwrite of the local database';
    submitBtn.textContent = 'Run import';
  } else if (action === 'sync') {
    forceLabel.textContent = 'Force overwrite of the local database';
    submitBtn.textContent = 'Run sync';
  } else if (action === 'query') {
    fileHint.textContent = 'Optional SQL file path. Use this or the inline SQL query above.';
    submitBtn.textContent = 'Run query';
  } else {
    submitBtn.textContent = 'Run download';
  }
}

function openDbModal(worktreeName) {
  currentDbWorktree = worktreeName;
  document.getElementById('db-title').textContent = worktreeName + ' — DB tools';
  document.getElementById('db-subtitle').textContent = 'Advanced database workflows';
  document.getElementById('db-error').textContent = '';
  document.getElementById('db-form').reset();
  document.getElementById('db-force').checked = true;
  setDbAction('download');
  setModalOpen('db-overlay', true);
  setTimeout(function() {
    document.getElementById('db-environment').focus();
  }, 0);
}

function closeDbModal() {
  currentDbWorktree = null;
  document.getElementById('db-error').textContent = '';
  document.getElementById('db-form').reset();
  setDbAction('download');
  setModalOpen('db-overlay', false);
}

function openResourceExportModal(worktreeName) {
  currentResourceWorktree = worktreeName;
  document.getElementById('resource-title').textContent = worktreeName + ' — Resource export';
  document.getElementById('resource-subtitle').textContent = 'Bulk export for this environment';
  document.getElementById('resource-error').textContent = '';
  document.getElementById('resource-form').reset();
  document.querySelectorAll('[data-resource-kind]').forEach(function(input) {
    input.checked = true;
  });
  setModalOpen('resource-overlay', true);
  setTimeout(function() {
    document.getElementById('resource-templates').focus();
  }, 0);
}

function closeResourceExportModal() {
  currentResourceWorktree = null;
  document.getElementById('resource-error').textContent = '';
  document.getElementById('resource-form').reset();
  document.querySelectorAll('[data-resource-kind]').forEach(function(input) {
    input.checked = true;
  });
  setModalOpen('resource-overlay', false);
}

async function submitResourceExport(event) {
  event.preventDefault();
  if (!currentResourceWorktree) {
    return;
  }

  var submitBtn = document.getElementById('resource-submit');
  var errorEl = document.getElementById('resource-error');
  var resources = Array.from(document.querySelectorAll('[data-resource-kind]')).filter(function(input) {
    return input.checked;
  }).map(function(input) {
    return input.value;
  });

  if (resources.length === 0) {
    errorEl.textContent = 'Select at least one resource export.';
    return;
  }

  errorEl.textContent = '';
  submitBtn.disabled = true;

  try {
    var res = await fetch('/api/worktrees/' + encodeURIComponent(currentResourceWorktree) + '/resource/export', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({resources: resources}),
    });
    var data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || ('HTTP ' + res.status));
    }

    closeResourceExportModal();
    showToast('Queued: resource export for ' + currentResourceWorktree);
    clearPoll();
    await fetchStatus();
    startPoll();
  } catch (e) {
    errorEl.textContent = String(e.message || e);
  } finally {
    submitBtn.disabled = false;
  }
}

async function submitDbAction(event) {
  event.preventDefault();
  if (!currentDbWorktree) {
    return;
  }

  var submitBtn = document.getElementById('db-submit');
  var errorEl = document.getElementById('db-error');
  var environment = document.getElementById('db-environment').value.trim();
  var file = document.getElementById('db-file').value.trim();
  var force = document.getElementById('db-force').checked;
  var query = document.getElementById('db-query').value.trim();
  var payload = {};

  if (currentDbAction === 'download' || currentDbAction === 'sync') {
    if (!environment) {
      errorEl.textContent = 'Environment is required.';
      return;
    }
    payload.environment = environment;
  }

  if (currentDbAction === 'sync' || currentDbAction === 'import') {
    payload.force = force;
  }

  if (currentDbAction === 'import' || currentDbAction === 'query') {
    if (file) {
      payload.file = file;
    }
  }

  if (currentDbAction === 'query') {
    if (!query && !file) {
      errorEl.textContent = 'Provide inline SQL or a file path.';
      return;
    }
    if (query) {
      payload.query = query;
    }
  }

  errorEl.textContent = '';
  submitBtn.disabled = true;

  try {
    var res = await fetch('/api/worktrees/' + encodeURIComponent(currentDbWorktree) + '/db/' + currentDbAction, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    var data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || ('HTTP ' + res.status));
    }

    closeDbModal();
    showToast('Queued: DB ' + currentDbAction + ' for ' + currentDbWorktree);
    clearPoll();
    await fetchStatus();
    startPoll();
  } catch (e) {
    errorEl.textContent = String(e.message || e);
  } finally {
    submitBtn.disabled = false;
    setDbAction(currentDbAction);
  }
}

async function submitCreateWorktree(event) {
  event.preventDefault();
  var submitBtn = document.getElementById('create-submit');
  var errorEl = document.getElementById('create-error');
  var name = document.getElementById('create-name').value.trim();
  var baseRef = document.getElementById('create-base').value.trim();
  var withEnv = document.getElementById('create-with-env').checked;
  var stopMainForClone = withEnv && document.getElementById('create-stop-main').checked;
  var restartMainAfterClone = stopMainForClone && document.getElementById('create-restart-main').checked;

  if (!name) {
    errorEl.textContent = 'Worktree name is required.';
    return;
  }

  errorEl.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';

  try {
    var res = await fetch('/api/worktrees', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: name,
        baseRef: baseRef || undefined,
        withEnv: withEnv,
        stopMainForClone: stopMainForClone,
        restartMainAfterClone: restartMainAfterClone,
      }),
    });
    var data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || ('HTTP ' + res.status));
    }

    closeCreateModal();
    showToast('Create queued: ' + name);
    clearPoll();
    await fetchStatus();
    startPoll();
  } catch (e) {
    errorEl.textContent = String(e.message || e);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create worktree';
  }
}

function svcDotClass(state, health) {
  if (!state) return 'gray';
  if (state === 'running' && health === 'healthy') return 'green';
  if (state === 'running' && !health) return 'green';
  if (state === 'running') return 'yellow';
  if (state === 'exited' || state === 'dead') return 'red';
  return 'yellow';
}

function envBadge(env) {
  if (!env) return {label: 'no env', cls: 'gray'};
  var lf = env.liferay;
  if (!lf || !lf.state) return {label: 'stopped', cls: 'gray'};
  if (lf.state === 'running' && lf.health === 'healthy') return {label: 'running', cls: 'green'};
  if (lf.state === 'running' && !lf.health) return {label: 'running', cls: 'green'};
  if (lf.state === 'running') return {label: 'starting…', cls: 'yellow'};
  if (lf.state === 'exited') return {label: 'stopped', cls: 'red'};
  return {label: lf.state, cls: 'yellow'};
}

function renderAheadBehind(ab) {
  if (!ab) return '';
  var parts = [];
  if (ab.ahead > 0) parts.push('<span class="ahead">↑' + ab.ahead + '</span>');
  if (ab.behind > 0) parts.push('<span class="behind">↓' + ab.behind + '</span>');
  if (parts.length === 0) return '<span style="font-size:11px;color:var(--text2)">up to date</span>';
  return '<span class="ahead-behind" title="vs ' + esc(ab.base) + '">' + parts.join(' ') + '</span>';
}

function hasReachablePortal(wt) {
  return Boolean(wt.env && wt.env.portalUrl && isRunningWorktree(wt));
}

function isRunningWorktree(wt) {
  return Boolean(wt.env && wt.env.liferay && wt.env.liferay.state === 'running');
}

function hasLocalChanges(wt) {
  return Boolean(wt.changedFiles > 0);
}

function isBehindBase(wt) {
  return Boolean(wt.aheadBehind && wt.aheadBehind.behind > 0);
}

function needsAttention(wt) {
  if (wt.isMain) {
    return false;
  }

  if (hasLocalChanges(wt) || isBehindBase(wt)) {
    return true;
  }

  return false;
}

function matchesFilter(wt, filterKey) {
  if (filterKey === 'running') return isRunningWorktree(wt);
  if (filterKey === 'dirty') return hasLocalChanges(wt);
  if (filterKey === 'up') return isRunningWorktree(wt);
  if (filterKey === 'main') return Boolean(wt.isMain);
  if (filterKey === 'attention') return needsAttention(wt);
  return true;
}

function getFilterCount(worktrees, filterKey) {
  if (filterKey === 'all') {
    return worktrees.length;
  }

  var count = 0;
  for (var i = 0; i < worktrees.length; i++) {
    if (matchesFilter(worktrees[i], filterKey)) {
      count++;
    }
  }

  return count;
}

function buildFilterCounts(worktrees) {
  var counts = {all: worktrees.length};
  for (var i = 0; i < FILTER_CONFIG.length; i++) {
    if (FILTER_CONFIG[i].key !== 'all') {
      counts[FILTER_CONFIG[i].key] = 0;
    }
  }

  for (var worktreeIndex = 0; worktreeIndex < worktrees.length; worktreeIndex++) {
    var worktree = worktrees[worktreeIndex];
    for (var filterIndex = 0; filterIndex < FILTER_CONFIG.length; filterIndex++) {
      var filterKey = FILTER_CONFIG[filterIndex].key;
      if (filterKey !== 'all' && matchesFilter(worktree, filterKey)) {
        counts[filterKey] += 1;
      }
    }
  }

  return counts;
}

function getWorktreePriority(wt) {
  if (wt.isMain) return 0;
  if (isRunningWorktree(wt)) return 1;
  if (hasLocalChanges(wt)) return 2;
  if (needsAttention(wt)) return 3;
  return 4;
}

function compareWorktrees(left, right) {
  var priorityDelta = getWorktreePriority(left) - getWorktreePriority(right);
  if (priorityDelta !== 0) return priorityDelta;

  var leftChangedFiles = left.changedFiles || 0;
  var rightChangedFiles = right.changedFiles || 0;
  if (leftChangedFiles !== rightChangedFiles) {
    return rightChangedFiles - leftChangedFiles;
  }

  var leftBehind = left.aheadBehind ? left.aheadBehind.behind || 0 : 0;
  var rightBehind = right.aheadBehind ? right.aheadBehind.behind || 0 : 0;
  if (leftBehind !== rightBehind) {
    return rightBehind - leftBehind;
  }

  return String(left.name || '').localeCompare(String(right.name || ''));
}

function matchesSearch(wt, query) {
  if (!query) {
    return true;
  }

  var haystack = [wt.name, wt.branch, wt.path].filter(Boolean).join(' ').toLowerCase();
  return haystack.indexOf(query) !== -1;
}

function getRunningTask(worktreeName, kind) {
  var tasks = taskState && taskState.tasks ? taskState.tasks : [];
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    if (task.status === 'running' && task.kind === kind && task.worktreeName === (worktreeName || null)) {
      return task;
    }
  }
  return null;
}

function actionTaskKind(action) {
  if (action === 'start') return 'worktree-start';
  if (action === 'stop') return 'worktree-stop';
  if (action === 'init-env') return 'worktree-env-init';
  if (action === 'resource-export') return 'resource-export';
  if (action === 'restart') return 'env-restart';
  if (action === 'recreate') return 'env-recreate';
  if (action === 'deploy-cache-update') return 'deploy-cache-update';
  if (action === 'mcp-setup') return 'mcp-setup';
  if (action === 'delete') return 'worktree-delete';
  return null;
}

function isActionBusy(worktreeName, action) {
  var kind = actionTaskKind(action);
  return kind ? Boolean(getRunningTask(worktreeName, kind)) : false;
}

function renderActionButton(name, action, className, label) {
  var disabled = isActionBusy(name, action);
  return '<button class="action ' + className + '" data-name="' + esc(name) + '" data-action="' + action + '"' + (disabled ? ' disabled aria-disabled="true"' : '') + '>' + esc(disabled ? 'Running…' : label) + '</button>';
}

function renderDeleteButton(name) {
  var disabled = isActionBusy(name, 'delete');
  return '<button class="btn-delete" data-name="' + esc(name) + '" data-action="delete" title="Delete worktree"' + (disabled ? ' disabled aria-disabled="true"' : '') + '>🗑</button>';
}

function renderToolbar(worktrees, visibleWorktrees, filterCounts) {
  var chips = FILTER_CONFIG.map(function(filter) {
    var count = filterCounts[filter.key] || 0;
    var active = filter.key === activeFilter ? ' active' : '';
    return '<button class="filter-chip' + active + '" type="button" data-filter="' + filter.key + '">' + esc(filter.label) + ' <span>(' + count + ')</span></button>';
  }).join('');

  return '<div class="toolbar">' +
    '<div class="toolbar-group">' + chips + '</div>' +
    '<label class="toolbar-search"><input id="worktree-search" type="search" value="' + esc(searchQuery) + '" placeholder="Search worktree, branch, path"></label>' +
    '<div class="spacer"></div>' +
    '<div class="toolbar-meta">Showing ' + visibleWorktrees.length + ' of ' + worktrees.length + ' worktrees</div>' +
  '</div>';
}

function renderMaintenancePanel() {
  var candidates = maintenanceState.candidates || [];
  var body = '';
  if (maintenanceState.loading) {
    body = '<div class="maintenance-empty">Checking stale worktrees…</div>';
  } else if (maintenanceState.error) {
    body = '<div class="maintenance-empty" style="color:var(--red)">' + esc(maintenanceState.error) + '</div>';
  } else if (candidates.length === 0) {
    body = '<div class="maintenance-empty">No stale worktrees found for the current threshold.</div>';
  } else {
    body = '<div class="maintenance-list">' + candidates.map(function(candidate) {
      return '<span class="maintenance-chip">' + esc(candidate) + '</span>';
    }).join('') + '</div>';
  }

  return '<section class="maintenance">' +
    '<div class="maintenance-header">' +
      '<div><div class="maintenance-title">Maintenance</div><div class="maintenance-sub">Preview stale worktrees and apply conservative cleanup.</div></div>' +
      '<div class="spacer"></div>' +
      '<div class="maintenance-controls">' +
        '<input id="maintenance-days" type="number" min="1" value="' + esc(String(maintenanceState.days || 7)) + '" />' +
        '<button class="btn-secondary" type="button" id="maintenance-refresh">Preview stale</button>' +
        '<button class="btn-secondary" type="button" id="maintenance-apply"' + (candidates.length === 0 ? ' disabled' : '') + '>Apply GC</button>' +
      '</div>' +
    '</div>' +
    body +
  '</section>';
}

function bindFilterButtons() {
  document.querySelectorAll('button[data-filter]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      activeFilter = btn.getAttribute('data-filter') || 'all';
      writeDashboardPrefs();
      if (lastData) {
        render(lastData);
      }
    });
  });

  var searchInput = document.getElementById('worktree-search');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      searchQuery = searchInput.value.trim();
      writeDashboardPrefs();
      if (lastData) {
        render(lastData);
      }
    });
  }
}

function getPrimaryAction(wt, safeName, isRunning, isStopped, hasContainer) {
  if (!wt.env && !wt.isMain) {
    return {key: 'init-env', markup: renderActionButton(wt.name, 'init-env', 'btn-ghost', 'Init env')};
  }

  if (wt.env && wt.env.portalUrl && isRunning) {
    return {key: 'open-portal', markup: '<a class="action-link" href="' + esc(wt.env.portalUrl) + '" target="_blank" rel="noreferrer">↗ Open portal</a>'};
  }

  if (isStopped) {
    return {key: 'start', markup: renderActionButton(wt.name, 'start', 'btn-start', '▶ Start env')};
  }

  if (hasContainer) {
    return {key: 'logs', markup: '<button class="action btn-logs" data-name="' + safeName + '" data-action="logs">≡ View logs</button>'};
  }

  if (!wt.env) {
    return {key: 'mcp-setup', markup: renderActionButton(wt.name, 'mcp-setup', 'btn-ghost', 'MCP setup')};
  }

  if (isRunning) {
    return {key: 'mcp-setup', markup: renderActionButton(wt.name, 'mcp-setup', 'btn-ghost', 'Resume setup')};
  }

  return {key: 'mcp-setup', markup: renderActionButton(wt.name, 'mcp-setup', 'btn-ghost', 'MCP setup')};
}

function getSuggestedRepairActions(wt, safeName, isRunning, isStopped, hasContainer) {
  if (!wt.env && !wt.isMain) {
    return {
      title: 'Suggested repair',
      hint: 'No isolated environment exists yet.',
      buttons: [
        '<button class="action btn-ghost" data-name="' + safeName + '" data-action="init-env">1. Init env</button>',
        renderActionButton(wt.name, 'doctor', 'btn-ghost', '2. Diagnose')
      ]
    };
  }

  if (!wt.env) {
    return null;
  }

  if (isStopped) {
    return {
      title: 'Suggested repair',
      hint: 'The Liferay container is stopped.',
      buttons: [
        renderActionButton(wt.name, 'start', 'btn-start', '1. Start env'),
        renderActionButton(wt.name, 'doctor', 'btn-ghost', '2. Diagnose'),
        renderActionButton(wt.name, 'recreate', 'btn-ghost', '3. Recreate')
      ]
    };
  }

  if (isRunning) {
    return {
      title: 'Suggested next steps',
      hint: 'Runtime is up. Run deeper checks only when needed.',
      buttons: [
        '<button class="action btn-ghost" data-name="' + safeName + '" data-action="deploy-status">Deploy status</button>',
        renderActionButton(wt.name, 'deploy-cache-update', 'btn-ghost', 'Cache update'),
        renderActionButton(wt.name, 'doctor', 'btn-ghost', 'Diagnose')
      ]
    };
  }

  return null;
}

function renderWorktreeTools(wt, safeName) {
  var lf = wt.env && wt.env.liferay;
  var isRunning = lf && lf.state === 'running';
  var isStopped = !lf || !lf.state || lf.state === 'exited';
  var buttons = [];

  if (wt.env) {
    if (!isRunning) {
      buttons.push('<button class="action btn-ghost" data-name="' + safeName + '" data-action="deploy-status">Deploy status</button>');
      buttons.push(renderActionButton(wt.name, 'deploy-cache-update', 'btn-ghost', 'Cache update'));
    }

    if (!isStopped) {
      buttons.push(renderActionButton(wt.name, 'restart', 'btn-ghost', 'Restart'));
    }

    buttons.push(renderActionButton(wt.name, 'recreate', 'btn-ghost', 'Recreate'));
  }

  if (!isRunning) {
    buttons.unshift('<button class="action btn-ghost" data-name="' + safeName + '" data-action="doctor">Diagnose</button>');
  }

  return '<div class="card-panel">' +
    '<div class="card-panel-header"><div class="card-panel-title">Operations</div></div>' +
    '<div class="actions">' + buttons.join('') + '</div>' +
  '</div>';
}

function renderSuggestedRepair(wt, safeName, isRunning, isStopped, hasContainer) {
  var plan = getSuggestedRepairActions(wt, safeName, isRunning, isStopped, hasContainer);
  if (!plan || !plan.buttons || plan.buttons.length === 0) {
    return '';
  }

  return '<div class="card-panel card-panel-priority">' +
    '<div class="card-panel-header"><div class="card-panel-title">' + esc(plan.title) + '</div><div class="detail-meta"><span>' + esc(plan.hint || '') + '</span></div></div>' +
    '<div class="actions">' + plan.buttons.join('') + '</div>' +
  '</div>';
}

function renderCard(wt) {
  var badge = envBadge(wt.env);
  var safeName = esc(wt.name);
  var safePath = esc(wt.path);
  var badges = ['<span class="badge badge-' + badge.cls + '">' + badge.label + '</span>'];

  if (wt.isMain) {
    badges.push('<span class="badge badge-blue">main</span>');
  } else if (needsAttention(wt)) {
    badges.push('<span class="badge badge-yellow">needs attention</span>');
  }

  if (hasLocalChanges(wt)) {
    badges.push('<span class="badge badge-yellow">' + esc(String(wt.changedFiles)) + ' modified</span>');
  }

  var services = '';
  var servicesCount = 0;
  var serviceSummary = {total: 0, healthy: 0, warned: 0, failed: 0, unknown: 0};
  if (wt.env && wt.env.services && wt.env.services.length > 0) {
    servicesCount = wt.env.services.length;
    serviceSummary = summarizeServiceHealth(wt.env.services);
    services = '<div class="services">' + wt.env.services.map(function(s) {
      var cls = svcDotClass(s.state, s.health);
      return '<span class="svc"><span class="dot dot-' + cls + '"></span>' + esc(s.service) + '</span>';
    }).join('') + '</div>';
  }

  var portal = '';
  if (wt.env && wt.env.portalUrl) {
    portal = '<div class="portal-row"><a href="' + esc(wt.env.portalUrl) + '" target="_blank">' + esc(wt.env.portalUrl) + '</a>' +
      (typeof wt.env.portalReachable === 'boolean'
        ? '<span class="reach-dot" style="background:' + (wt.env.portalReachable ? 'var(--green)' : 'var(--text2)') + '" title="' + (wt.env.portalReachable ? 'reachable' : 'unreachable') + '"></span>'
        : '') + '</div>';
  }

  var lf = wt.env && wt.env.liferay;
  var isRunning = lf && lf.state === 'running';
  var isStopped = !lf || !lf.state || lf.state === 'exited';
  var hasContainer = lf && lf.containerId;
  var primaryAction = getPrimaryAction(wt, safeName, isRunning, isStopped, hasContainer);

  // Path row with copy button
  var pathRow = '<div class="path-row">' +
    '<span class="path-text" title="' + safePath + '">' + safePath + '</span>' +
    '<button class="btn-copy" data-path="' + safePath + '" title="Copy path for cd">⎘ copy</button>' +
    '</div>';

  var envActions = '';
  if (wt.env) {
    var startBtn = isRunning || isActionBusy(wt.name, 'start') || primaryAction.key === 'start' ? '' : renderActionButton(wt.name, 'start', 'btn-start', '▶ Start');
    var stopBtn = isRunning ? renderActionButton(wt.name, 'stop', 'btn-stop', '■ Stop') : '';
    var logsBtn = hasContainer && primaryAction.key !== 'logs' ? '<button class="action btn-logs" data-name="' + safeName + '" data-action="logs">≡ Logs</button>' : '';
    var mcpBtn = primaryAction.key === 'mcp-setup' ? '' : renderActionButton(wt.name, 'mcp-setup', 'btn-ghost', 'MCP setup');
    var dbBtn = '<button class="action btn-ghost" data-name="' + safeName + '" data-action="db-tools">DB tools</button>';
    var resourceBtn = renderActionButton(wt.name, 'resource-export', 'btn-ghost', 'Resource export');
    envActions = primaryAction.markup + stopBtn + startBtn + logsBtn + mcpBtn + dbBtn + resourceBtn;
  } else {
    envActions = '<span class="no-env">No isolated env yet</span>' + primaryAction.markup;
  }

  var deleteBtn = !wt.isMain
    ? '<div class="actions-spacer"></div>' + renderDeleteButton(wt.name)
    : '';

  var actions = '<div class="actions">' + envActions + deleteBtn + '</div>';

  var commits = '';
  var commitCount = 0;
  var commitPreview = '';
  var changedPaths = Array.isArray(wt.changedPaths) ? wt.changedPaths.filter(Boolean) : [];
  if (wt.commits && wt.commits.length > 0) {
    commitCount = wt.commits.length;
    var changed = wt.changedFiles > 0 ? '<span class="changed">' + wt.changedFiles + ' modified</span>' : '';
    var latestCommit = wt.commits[0];
    var extraCommits = commitCount > 1 ? '<span class="card-preview-meta">+' + (commitCount - 1) + ' more</span>' : '';
    commitPreview = '<div class="card-preview-row"><span class="card-preview-label">Latest commit</span><div class="commit-preview" title="' + esc(latestCommit.subject) + '"><span class="chash">' + esc(latestCommit.hash) + '</span><span class="commit-preview-subject">' + esc(latestCommit.subject) + '</span></div>' + extraCommits + '</div>';
    commits = '<div class="commits"><div class="commits-header"><span class="commits-label">Commits</span>' + changed + '</div>' +
      wt.commits.map(function(c) {
        return '<div class="commit"><span class="chash">' + esc(c.hash) + '</span><span class="csubject" title="' + esc(c.subject) + '">' + esc(c.subject) + '</span><span class="cdate">' + esc(c.date) + '</span></div>';
      }).join('') + '</div>';
  }

  var tools = renderWorktreeTools(wt, safeName);
  var suggestedRepair = renderSuggestedRepair(wt, safeName, isRunning, isStopped, hasContainer);
  var commitSpotlight = wt.changedFiles > 0 && commits
    ? '<div class="card-panel">' + commits + '</div>'
    : '';
  var cardSections = [];
  if (changedPaths.length > 0) {
    cardSections.push(buildChangesSection(changedPaths, wt.changedFiles));
  }
  if (services) {
    cardSections.push(buildServicesSection(services, serviceSummary, isRunning));
  }
  if (commits) {
    cardSections.push(buildCommitsSection(commits, commitCount, wt.changedFiles));
  }
  var cardSectionsBlock = cardSections.length
    ? renderCardSections(wt.name, cardSections, getCardSectionKey(wt.name, cardSections, cardSections[0].key))
    : '';
  var visiblePanels = [suggestedRepair, tools, commitSpotlight, cardSectionsBlock].filter(Boolean).join('');

  var mainLabel = wt.isMain ? '<span class="card-main-label">(main)</span>' : '';
  var branch = wt.branch ? wt.branch : (wt.detached ? 'HEAD detached' : '—');
  var abHtml = renderAheadBehind(wt.aheadBehind);

  return '<div class="card">' +
    '<div class="card-header">' +
      '<div class="card-meta">' +
        '<div class="card-title">' + safeName + mainLabel + '</div>' +
        '<div class="card-branch">' + esc(branch) + '</div>' +
      '</div>' +
      '<div class="card-badges">' +
        '<div class="card-badge-row">' + badges.join('') + '</div>' +
        (abHtml ? '<div>' + abHtml + '</div>' : '') +
      '</div>' +
    '</div>' +
      pathRow + portal + commitPreview + actions + (visiblePanels ? '<div class="card-panel-stack">' + visiblePanels + '</div>' : '') +
    '</div>';
}

function render(data) {
  lastData = data;
  var cwdEl = document.getElementById('cwd-info');
  if (cwdEl) cwdEl.textContent = data.cwd || '';
  var normalizedSearchQuery = searchQuery.toLowerCase();
  var worktrees = (data.worktrees || []).slice().sort(compareWorktrees);
  var filterCounts = buildFilterCounts(worktrees);
  var visibleWorktrees = worktrees.filter(function(wt) {
    return matchesFilter(wt, activeFilter) && matchesSearch(wt, normalizedSearchQuery);
  });

  var app = document.getElementById('app');
  if (!worktrees || worktrees.length === 0) {
    app.innerHTML = '<div class="center">No worktrees found. Run <code>ldev worktree setup</code> to create one.</div>';
    return;
  }

  if (visibleWorktrees.length === 0) {
    app.innerHTML = renderToolbar(worktrees, visibleWorktrees, filterCounts) + renderMaintenancePanel() + '<div class="center">No worktrees match this filter.</div>';
    bindFilterButtons();
    bindMaintenanceControls();
    return;
  }

  app.innerHTML = renderToolbar(worktrees, visibleWorktrees, filterCounts) + renderMaintenancePanel() + '<div class="dashboard-stack"><div class="grid">' + visibleWorktrees.map(renderCard).join('') + '</div></div>';
  bindFilterButtons();
  bindMaintenanceControls();
}

function bindMaintenanceControls() {
  var refreshBtn = document.getElementById('maintenance-refresh');
  var applyBtn = document.getElementById('maintenance-apply');
  var daysInput = document.getElementById('maintenance-days');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      var days = Number.parseInt(daysInput.value, 10) || 7;
      void fetchMaintenancePreview(days);
    });
  }
  if (applyBtn) {
    applyBtn.addEventListener('click', function() {
      var days = Number.parseInt(daysInput.value, 10) || 7;
      void applyMaintenanceGc(days);
    });
  }
}

async function doAction(name, action, btn) {
  if (action === 'doctor') {
    void openDoctorPreview(name);
    return;
  }
  if (action === 'deploy-status') {
    void openDeployPreview(name);
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    var url = '/api/worktrees/' + encodeURIComponent(name) + '/' + action;
    if (action === 'mcp-setup') {
      url = '/api/worktrees/' + encodeURIComponent(name) + '/mcp/setup';
    } else if (action === 'init-env') {
      url = '/api/worktrees/' + encodeURIComponent(name) + '/env/init';
    } else if (action === 'doctor') {
      url = '/api/worktrees/' + encodeURIComponent(name) + '/doctor';
    } else if (action === 'restart') {
      url = '/api/worktrees/' + encodeURIComponent(name) + '/env/restart';
    } else if (action === 'recreate') {
      url = '/api/worktrees/' + encodeURIComponent(name) + '/env/recreate';
    } else if (action === 'deploy-status') {
      url = '/api/worktrees/' + encodeURIComponent(name) + '/deploy/status';
    } else if (action === 'deploy-cache-update') {
      url = '/api/worktrees/' + encodeURIComponent(name) + '/deploy/cache-update';
    }
    var res = await fetch(url, {method: 'POST'});
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    if (action === 'mcp-setup') {
      showToast('Queued: MCP setup for ' + name);
    } else if (action === 'init-env') {
      showToast('Queued: init env for ' + name);
    } else if (action === 'doctor') {
      showToast('Queued: diagnose for ' + name);
    } else if (action === 'restart' || action === 'recreate') {
      showToast('Queued: ' + action + ' env for ' + name);
    } else if (action === 'deploy-status' || action === 'deploy-cache-update') {
      showToast('Queued: ' + action.replace('deploy-', 'deploy ') + ' for ' + name);
    } else {
      showToast('Queued: ' + action + ' ' + name);
    }
  } catch(e) {
    showToast('Error: ' + String(e.message));
  }
  clearPoll();
  setTimeout(function() { fetchStatus().then(startPoll); }, 400);
}

async function runRepoDiagnose() {
  void openDoctorPreview(null);
}

async function queueDoctorTask(worktreeName) {
  try {
    var url = worktreeName ? '/api/worktrees/' + encodeURIComponent(worktreeName) + '/doctor' : '/api/doctor';
    var res = await fetch(url, {method: 'POST'});
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    showToast('Queued: diagnose' + (worktreeName ? ' for ' + worktreeName : ' for repo'));
  } catch (e) {
    showToast('Error: ' + String(e.message));
  }
  clearPoll();
  setTimeout(function() { fetchStatus().then(startPoll); }, 400);
}

async function openDoctorPreview(worktreeName) {
  openInfoModal(
    (worktreeName || 'Repository') + ' — Diagnose',
    worktreeName ? 'Structured health view for this worktree' : 'Structured health view for the current repo',
    '<div class="maintenance-empty">Loading diagnosis…</div>',
    'preview',
    'Refresh diagnosis',
    {mode: 'doctor', target: worktreeName || null}
  );
  try {
    var url = worktreeName ? '/api/worktrees/' + encodeURIComponent(worktreeName) + '/doctor' : '/api/doctor';
    var res = await fetch(url, {cache: 'no-store'});
    var report = await res.json();
    if (!res.ok) throw new Error(report.error || ('HTTP ' + res.status));
    document.getElementById('modal-body').innerHTML = renderDoctorPreview(report, worktreeName);
    document.getElementById('modal-info').textContent = (report.summary.failed || 0) + ' failed · ' + (report.summary.warned || 0) + ' warned';
    var runBtn = document.getElementById('modal-run-task');
    if (runBtn) {
      runBtn.addEventListener('click', function() {
        void queueDoctorTask(worktreeName || null);
      });
    }
  } catch (e) {
    document.getElementById('modal-body').innerHTML = '<div class="log-empty" style="color:var(--red)">Error: ' + esc(String(e.message)) + '</div>';
    document.getElementById('modal-info').textContent = 'preview failed';
  }
}

async function openDeployPreview(worktreeName) {
  openInfoModal(
    worktreeName + ' — Deploy status',
    'Structured deploy inventory for this worktree',
    '<div class="maintenance-empty">Loading deploy status…</div>',
    'preview',
    'Refresh deploy status',
    {mode: 'deploy-status', target: worktreeName}
  );
  try {
    var res = await fetch('/api/worktrees/' + encodeURIComponent(worktreeName) + '/deploy/status', {cache: 'no-store'});
    var result = await res.json();
    if (!res.ok) throw new Error(result.error || ('HTTP ' + res.status));
    document.getElementById('modal-body').innerHTML = renderDeployPreview(result, worktreeName);
    document.getElementById('modal-info').textContent = (result.modules || []).length + ' modules';
  } catch (e) {
    document.getElementById('modal-body').innerHTML = '<div class="log-empty" style="color:var(--red)">Error: ' + esc(String(e.message)) + '</div>';
    document.getElementById('modal-info').textContent = 'preview failed';
  }
}

async function fetchMaintenancePreview(days) {
  maintenanceState.loading = true;
  maintenanceState.error = null;
  maintenanceState.days = days;
  if (lastData) {
    render(lastData);
  }
  try {
    var res = await fetch('/api/maintenance/worktrees/gc?days=' + encodeURIComponent(String(days)), {cache: 'no-store'});
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    maintenanceState = {days: days, candidates: data.candidates || [], loading: false, error: null};
  } catch (e) {
    maintenanceState = {days: days, candidates: [], loading: false, error: String(e.message || e)};
  }

  if (lastData) {
    render(lastData);
  }
}

async function applyMaintenanceGc(days) {
  try {
    var res = await fetch('/api/maintenance/worktrees/gc', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({days: days, apply: true}),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    showToast('Queued: maintenance GC');
  } catch (e) {
    showToast('Error: ' + String(e.message));
  }
  clearPoll();
  setTimeout(function() {
    fetchStatus().then(startPoll);
    void fetchMaintenancePreview(days);
  }, 400);
}

async function doDelete(name, btn) {
  if (!confirm('Delete worktree "' + name + '"?\\n\\nThis will remove the git worktree and its docker environment data. This cannot be undone.')) return;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    var res = await fetch('/api/worktrees/' + encodeURIComponent(name), {method: 'DELETE'});
    var data = await res.json();
    if (!res.ok) {
      showToast('Error: ' + (data.error || res.status));
    } else {
      showToast('Delete queued: ' + name);
    }
  } catch(e) {
    showToast('Error: ' + String(e.message));
  }
  clearPoll();
  setTimeout(function() { fetchStatus().then(startPoll); }, 400);
}

async function fetchStatus() {
  var info = document.getElementById('refresh-info');
  try {
    var res = await fetch('/api/status');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    render(data);
    if (info) info.textContent = 'Updated ' + new Date(data.refreshedAt).toLocaleTimeString();
  } catch(e) {
    document.getElementById('app').innerHTML = '<div class="error-msg">Error: ' + esc(String(e.message)) + '</div>';
    if (info) info.textContent = 'Error';
  }
}

// ── Logs modal ──────────────────────────────────────────────────

function openLogs(worktreeName) {
  currentLogsWorktree = worktreeName;
  modalState = {mode: 'logs', target: worktreeName};
  document.getElementById('modal-title').textContent = worktreeName + ' — liferay logs';
  document.getElementById('modal-subtitle').textContent = '';
  setModalRefreshLabel('⟳ Refresh');
  setModalOpen('modal-overlay', true);
  startLogStream(worktreeName);
}

function closeLogs() {
  stopLogStream();
  setModalOpen('modal-overlay', false);
  currentLogsWorktree = null;
  modalState = {mode: null, target: null};
}

document.getElementById('modal-close').addEventListener('click', closeLogs);
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeLogs();
});
document.getElementById('modal-refresh').addEventListener('click', function() {
  if (modalState.mode === 'logs' && currentLogsWorktree) {
    startLogStream(currentLogsWorktree);
    return;
  }
  if (modalState.mode === 'doctor') {
    void openDoctorPreview(modalState.target || null);
    return;
  }
  if (modalState.mode === 'deploy-status' && modalState.target) {
    void openDeployPreview(modalState.target);
  }
});
document.getElementById('new-worktree-btn').addEventListener('click', openCreateModal);
document.getElementById('create-close').addEventListener('click', closeCreateModal);
document.getElementById('create-cancel').addEventListener('click', closeCreateModal);
document.getElementById('create-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeCreateModal();
});
document.getElementById('create-form').addEventListener('submit', submitCreateWorktree);
document.getElementById('create-with-env').addEventListener('change', updateCreateOptions);
document.getElementById('create-stop-main').addEventListener('change', updateCreateOptions);
document.getElementById('db-close').addEventListener('click', closeDbModal);
document.getElementById('db-cancel').addEventListener('click', closeDbModal);
document.getElementById('db-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeDbModal();
});
document.getElementById('db-form').addEventListener('submit', submitDbAction);
document.getElementById('resource-close').addEventListener('click', closeResourceExportModal);
document.getElementById('resource-cancel').addEventListener('click', closeResourceExportModal);
document.getElementById('resource-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeResourceExportModal();
});
document.getElementById('resource-form').addEventListener('submit', submitResourceExport);
document.querySelectorAll('[data-db-action]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    setDbAction(btn.getAttribute('data-db-action'));
  });
});
document.getElementById('app').addEventListener('click', function(e) {
  var target = e.target;
  if (!(target instanceof Element)) {
    return;
  }

  var sectionBtn = target.closest('button[data-card-section]');
  if (sectionBtn && this.contains(sectionBtn)) {
    var sectionName = sectionBtn.getAttribute('data-name');
    var sectionKey = sectionBtn.getAttribute('data-card-section');
    if (sectionName && sectionKey) {
      rememberCardSection(sectionName, sectionKey);
      if (lastData) {
        render(lastData);
      }
    }
    return;
  }

  var actionBtn = target.closest('button[data-action]');
  if (actionBtn && this.contains(actionBtn)) {
    var action = actionBtn.getAttribute('data-action');
    var name = actionBtn.getAttribute('data-name');
    if (action === 'logs') {
      openLogs(name);
    } else if (action === 'resource-export') {
      openResourceExportModal(name);
    } else if (action === 'db-tools') {
      openDbModal(name);
    } else if (action === 'delete') {
      doDelete(name, actionBtn);
    } else {
      doAction(name, action, actionBtn);
    }
    return;
  }

  var copyBtn = target.closest('button[data-path]');
  if (copyBtn && this.contains(copyBtn)) {
    var p = copyBtn.getAttribute('data-path');
    navigator.clipboard.writeText(p).then(function() {
      copyBtn.textContent = '✓ copied';
      copyBtn.classList.add('copied');
      showToast('Copied: cd ' + p);
      setTimeout(function() {
        copyBtn.textContent = '⎘ copy';
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(function() {
      showToast('Copy failed — check browser permissions');
    });
  }
});
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (currentLogsWorktree) {
    closeLogs();
    return;
  }
  if (!document.getElementById('db-overlay').classList.contains('hidden')) {
    closeDbModal();
    return;
  }
  if (!document.getElementById('resource-overlay').classList.contains('hidden')) {
    closeResourceExportModal();
    return;
  }
  if (!document.getElementById('create-overlay').classList.contains('hidden')) {
    closeCreateModal();
  }
});

// ── Polling ─────────────────────────────────────────────────────

function clearPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startPoll() {
  clearPoll();
  countdown = 20;
  var info = document.getElementById('refresh-info');
  pollTimer = setInterval(function() {
    countdown--;
    if (info && lastData) info.textContent = 'Updated ' + new Date(lastData.refreshedAt).toLocaleTimeString() + ' · ' + countdown + 's';
    if (countdown <= 0) {
      clearPoll();
      fetchStatus().then(startPoll);
    }
  }, 1000);
}

document.getElementById('refresh-btn').addEventListener('click', function() {
  clearPoll();
  fetchStatus().then(startPoll);
});
document.getElementById('diagnose-btn').addEventListener('click', function() {
  void runRepoDiagnose();
});
document.getElementById('activity-toggle').addEventListener('click', function() {
  activityCollapsed = !activityCollapsed;
  applyActivityState();
});

loadDashboardPrefs();
updateCreateOptions();
fetchTasks();
connectTaskStream();
void fetchMaintenancePreview(maintenanceState.days || 7);
fetchStatus().then(startPoll);
