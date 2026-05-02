export const dashboardHtml = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ldev Dashboard</title>
<style>
:root{--bg:#0d1117;--bg2:#161b22;--bg3:#21262d;--border:#30363d;--text:#e6edf3;--text2:#8b949e;--green:#3fb950;--yellow:#d29922;--red:#f85149;--blue:#58a6ff;--purple:#bc8cff}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;min-height:100vh}
header{padding:10px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;position:sticky;top:0;background:var(--bg);z-index:10}
.logo{font-weight:700;font-size:16px;color:var(--text)}
.logo span{color:var(--blue)}
.cwd{font-size:11px;color:var(--text2);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:400px}
.spacer{flex:1}
.refresh-pill{font-size:11px;color:var(--text2);background:var(--bg3);border:1px solid var(--border);padding:3px 10px;border-radius:10px}
.refresh-btn{background:var(--bg3);border:1px solid var(--border);color:var(--text2);padding:3px 8px;border-radius:6px;cursor:pointer;font-size:13px}
.refresh-btn:hover{color:var(--text)}
main{padding:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:10px}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.card-meta{flex:1;min-width:0}
.card-title{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-main-label{font-size:11px;color:var(--text2);font-weight:400;margin-left:5px}
.card-branch{font-size:11px;color:var(--text2);font-family:monospace;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-badges{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.badge{font-size:11px;font-weight:500;padding:2px 9px;border-radius:10px;white-space:nowrap}
.badge-green{background:rgba(63,185,80,.15);color:var(--green)}
.badge-yellow{background:rgba(210,153,34,.15);color:var(--yellow)}
.badge-red{background:rgba(248,81,73,.15);color:var(--red)}
.badge-gray{background:rgba(139,148,158,.12);color:var(--text2)}
.badge-blue{background:rgba(88,166,255,.12);color:var(--blue)}
.ahead-behind{font-size:11px;color:var(--text2);display:flex;gap:5px;align-items:center}
.ahead{color:var(--green)}
.behind{color:var(--yellow)}
.services{display:flex;flex-wrap:wrap;gap:5px}
.svc{font-size:11px;padding:2px 8px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;gap:4px;background:var(--bg3)}
.dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.dot-green{background:var(--green)}
.dot-yellow{background:var(--yellow)}
.dot-red{background:var(--red)}
.dot-gray{background:var(--text2)}
.portal-row{font-size:12px;display:flex;align-items:center;gap:6px}
.portal-row a{color:var(--blue);text-decoration:none}
.portal-row a:hover{text-decoration:underline}
.reach-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.actions{display:flex;gap:7px;flex-wrap:wrap}
button.action{padding:4px 12px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:12px;font-weight:500;transition:opacity .15s}
button.action:hover{opacity:.82}
button.action:disabled{opacity:.45;cursor:not-allowed}
.btn-start{background:rgba(63,185,80,.12);color:var(--green);border-color:rgba(63,185,80,.3)}
.btn-stop{background:rgba(248,81,73,.12);color:var(--red);border-color:rgba(248,81,73,.3)}
.btn-logs{background:rgba(139,148,158,.1);color:var(--text2);border-color:var(--border)}
.btn-logs:hover{color:var(--text);opacity:1}
.no-env{font-size:11px;color:var(--text2)}
.commits{border-top:1px solid var(--border);padding-top:8px;display:flex;flex-direction:column;gap:4px}
.commits-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}
.commits-label{font-size:11px;color:var(--text2);font-weight:500;text-transform:uppercase;letter-spacing:.04em}
.changed{font-size:11px;color:var(--yellow)}
.commit{display:flex;gap:7px;align-items:baseline}
.chash{color:var(--blue);font-family:monospace;font-size:11px;flex-shrink:0}
.csubject{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.cdate{font-size:10px;color:var(--text2);flex-shrink:0}
.center{text-align:center;padding:40px;color:var(--text2)}
.error-msg{color:var(--red);text-align:center;padding:40px}

/* Logs modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:100;display:flex;align-items:flex-end;justify-content:center;padding:20px}
.modal-overlay.hidden{display:none}
.modal{background:var(--bg2);border:1px solid var(--border);border-radius:10px;width:100%;max-width:900px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden}
.modal-header{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0}
.modal-title{font-weight:600;font-size:14px;flex:1}
.modal-subtitle{font-size:11px;color:var(--text2);font-family:monospace}
.modal-close{background:none;border:none;color:var(--text2);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;border-radius:4px}
.modal-close:hover{color:var(--text);background:var(--bg3)}
.modal-body{overflow-y:auto;flex:1;padding:12px 16px}
.log-pre{font-family:'Cascadia Code','Fira Code','JetBrains Mono',monospace;font-size:12px;line-height:1.6;color:#c9d1d9;white-space:pre-wrap;word-break:break-all}
.log-ts{color:var(--text2);user-select:none}
.log-loading{color:var(--text2);text-align:center;padding:20px}
.log-empty{color:var(--text2);text-align:center;padding:20px;font-size:13px}
.modal-footer{padding:8px 16px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0}
.log-info{font-size:11px;color:var(--text2);flex:1}
.btn-refresh-logs{background:var(--bg3);border:1px solid var(--border);color:var(--text2);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px}
.btn-refresh-logs:hover{color:var(--text)}
</style>
</head>
<body>
<header>
  <div class="logo"><span>l</span>dev</div>
  <div class="cwd" id="cwd-info"></div>
  <div class="spacer"></div>
  <span class="refresh-pill" id="refresh-info">—</span>
  <button class="refresh-btn" id="refresh-btn" title="Refresh now">⟳</button>
</header>
<main id="app"><div class="center">Loading dashboard…</div></main>

<div class="modal-overlay hidden" id="modal-overlay">
  <div class="modal" id="modal">
    <div class="modal-header">
      <span class="modal-title" id="modal-title">Logs</span>
      <span class="modal-subtitle" id="modal-subtitle"></span>
      <button class="modal-close" id="modal-close" title="Close (Esc)">✕</button>
    </div>
    <div class="modal-body" id="modal-body">
      <div class="log-loading">Loading…</div>
    </div>
    <div class="modal-footer">
      <span class="log-info" id="modal-info"></span>
      <button class="btn-refresh-logs" id="modal-refresh">⟳ Refresh</button>
    </div>
  </div>
</div>

<script>
var lastData = null;
var countdown = 0;
var pollTimer = null;
var currentLogsWorktree = null;

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function svcDotClass(state, health) {
  if (!state) return 'gray';
  if (state === 'running' && health === 'healthy') return 'green';
  if (state === 'running') return 'yellow';
  if (state === 'exited' || state === 'dead') return 'red';
  return 'yellow';
}

function envBadge(env) {
  if (!env) return {label: 'no env', cls: 'gray'};
  var lf = env.liferay;
  if (!lf || !lf.state) return {label: 'stopped', cls: 'gray'};
  if (lf.state === 'running' && lf.health === 'healthy') return {label: 'running', cls: 'green'};
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

function renderCard(wt) {
  var badge = envBadge(wt.env);

  var services = '';
  if (wt.env && wt.env.services.length > 0) {
    services = '<div class="services">' + wt.env.services.map(function(s) {
      var cls = svcDotClass(s.state, s.health);
      return '<span class="svc"><span class="dot dot-' + cls + '"></span>' + esc(s.service) + '</span>';
    }).join('') + '</div>';
  }

  var portal = '';
  if (wt.env && wt.env.portalUrl) {
    var reachColor = wt.env.portalReachable ? 'var(--green)' : 'var(--text2)';
    portal = '<div class="portal-row"><a href="' + esc(wt.env.portalUrl) + '" target="_blank">' + esc(wt.env.portalUrl) + '</a>' +
      '<span class="reach-dot" style="background:' + reachColor + '" title="' + (wt.env.portalReachable ? 'reachable' : 'unreachable') + '"></span></div>';
  }

  var lf = wt.env && wt.env.liferay;
  var isRunning = lf && lf.state === 'running';
  var isStopped = !lf || !lf.state || lf.state === 'exited';
  var safeName = esc(wt.name);
  var hasContainer = lf && lf.containerId;

  var actions = '';
  if (wt.env) {
    var startBtn = isStopped ? '<button class="action btn-start" data-name="' + safeName + '" data-action="start">▶ Start</button>' : '';
    var stopBtn = isRunning ? '<button class="action btn-stop" data-name="' + safeName + '" data-action="stop">■ Stop</button>' : '';
    var logsBtn = hasContainer ? '<button class="action btn-logs" data-name="' + safeName + '" data-action="logs">≡ Logs</button>' : '';
    actions = '<div class="actions">' + startBtn + stopBtn + logsBtn + '</div>';
  } else {
    actions = '<div class="no-env">No docker env configured</div>';
  }

  var commits = '';
  if (wt.commits && wt.commits.length > 0) {
    var changed = wt.changedFiles > 0 ? '<span class="changed">' + wt.changedFiles + ' modified</span>' : '';
    commits = '<div class="commits"><div class="commits-header"><span class="commits-label">Commits</span>' + changed + '</div>' +
      wt.commits.map(function(c) {
        return '<div class="commit"><span class="chash">' + esc(c.hash) + '</span><span class="csubject" title="' + esc(c.subject) + '">' + esc(c.subject) + '</span><span class="cdate">' + esc(c.date) + '</span></div>';
      }).join('') + '</div>';
  }

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
        '<span class="badge badge-' + badge.cls + '">' + badge.label + '</span>' +
        (abHtml ? '<div>' + abHtml + '</div>' : '') +
      '</div>' +
    '</div>' +
    services + portal + actions + commits +
    '</div>';
}

function render(data) {
  lastData = data;
  var cwdEl = document.getElementById('cwd-info');
  if (cwdEl) cwdEl.textContent = data.cwd || '';

  var app = document.getElementById('app');
  if (!data.worktrees || data.worktrees.length === 0) {
    app.innerHTML = '<div class="center">No worktrees found. Run <code>ldev worktree setup</code> to create one.</div>';
    return;
  }
  app.innerHTML = '<div class="grid">' + data.worktrees.map(renderCard).join('') + '</div>';

  document.querySelectorAll('button[data-action]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var action = btn.getAttribute('data-action');
      var name = btn.getAttribute('data-name');
      if (action === 'logs') {
        openLogs(name);
      } else {
        doAction(name, action, btn);
      }
    });
  });
}

async function doAction(name, action, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await fetch('/api/worktrees/' + encodeURIComponent(name) + '/' + action, {method: 'POST'});
  } catch(e) { /* ignore */ }
  clearPoll();
  setTimeout(function() { fetchStatus().then(startPoll); }, 1500);
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
  var overlay = document.getElementById('modal-overlay');
  var title = document.getElementById('modal-title');
  var subtitle = document.getElementById('modal-subtitle');
  title.textContent = worktreeName + ' — liferay logs';
  subtitle.textContent = '';
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  loadLogs(worktreeName);
}

function closeLogs() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  currentLogsWorktree = null;
}

function formatLogs(raw) {
  if (!raw) return '<div class="log-empty">No log output available.</div>';
  var lines = raw.split('\\n');
  var html = lines.map(function(line) {
    if (!line.trim()) return '';
    // Separate timestamp prefix (docker --timestamps gives: "2024-01-02T03:04:05.000Z text")
    var tsMatch = /^(\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z)\\s/.exec(line);
    if (tsMatch) {
      var ts = tsMatch[1].replace('T', ' ').replace('Z', '').slice(0, 19);
      var rest = line.slice(tsMatch[0].length);
      return '<span class="log-ts">' + esc(ts) + '  </span>' + esc(rest);
    }
    return esc(line);
  }).filter(Boolean).join('\\n');
  return '<pre class="log-pre">' + html + '</pre>';
}

async function loadLogs(worktreeName) {
  var body = document.getElementById('modal-body');
  var info = document.getElementById('modal-info');
  var subtitle = document.getElementById('modal-subtitle');
  body.innerHTML = '<div class="log-loading">Fetching logs…</div>';
  if (info) info.textContent = '';
  try {
    var res = await fetch('/api/worktrees/' + encodeURIComponent(worktreeName) + '/logs');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    body.innerHTML = formatLogs(data.logs);
    // scroll to bottom
    body.scrollTop = body.scrollHeight;
    if (subtitle) subtitle.textContent = data.containerId ? data.containerId.slice(0, 12) : '';
    if (info) {
      var lineCount = data.logs ? data.logs.split('\\n').filter(Boolean).length : 0;
      info.textContent = lineCount + ' lines · last 200 · ' + new Date().toLocaleTimeString();
    }
  } catch(e) {
    body.innerHTML = '<div class="log-empty" style="color:var(--red)">Error: ' + esc(String(e.message)) + '</div>';
  }
}

// Modal event listeners
document.getElementById('modal-close').addEventListener('click', closeLogs);
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeLogs();
});
document.getElementById('modal-refresh').addEventListener('click', function() {
  if (currentLogsWorktree) loadLogs(currentLogsWorktree);
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && currentLogsWorktree) closeLogs();
});

// ── Polling ─────────────────────────────────────────────────────

function clearPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startPoll() {
  clearPoll();
  countdown = 8;
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

fetchStatus().then(startPoll);
</script>
</body>
</html>`;
