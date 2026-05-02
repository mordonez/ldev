export const dashboardHtml = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ldev Dashboard</title>
<style>
:root{--bg:#0d1117;--bg2:#161b22;--bg3:#21262d;--border:#30363d;--text:#e6edf3;--text2:#8b949e;--green:#3fb950;--yellow:#d29922;--red:#f85149;--blue:#58a6ff}
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
.card-header{display:flex;justify-content:space-between;align-items:flex-start}
.card-title{font-weight:600;font-size:14px}
.card-main-label{font-size:11px;color:var(--text2);font-weight:400;margin-left:5px}
.card-branch{font-size:11px;color:var(--text2);font-family:monospace;margin-top:2px}
.badge{font-size:11px;font-weight:500;padding:2px 9px;border-radius:10px;white-space:nowrap}
.badge-green{background:rgba(63,185,80,.15);color:var(--green)}
.badge-yellow{background:rgba(210,153,34,.15);color:var(--yellow)}
.badge-red{background:rgba(248,81,73,.15);color:var(--red)}
.badge-gray{background:rgba(139,148,158,.12);color:var(--text2)}
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
.actions{display:flex;gap:7px}
button.action{padding:4px 12px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:12px;font-weight:500;transition:opacity .15s}
button.action:hover{opacity:.82}
button.action:disabled{opacity:.45;cursor:not-allowed}
.btn-start{background:rgba(63,185,80,.12);color:var(--green);border-color:rgba(63,185,80,.3)}
.btn-stop{background:rgba(248,81,73,.12);color:var(--red);border-color:rgba(248,81,73,.3)}
.no-env{font-size:11px;color:var(--text2)}
.commits{border-top:1px solid var(--border);padding-top:8px;display:flex;flex-direction:column;gap:4px}
.commits-header{display:flex;justify-content:space-between;align-items:center}
.commits-label{font-size:11px;color:var(--text2);font-weight:500;text-transform:uppercase;letter-spacing:.04em}
.changed{font-size:11px;color:var(--yellow)}
.commit{display:flex;gap:7px;align-items:baseline}
.chash{color:var(--blue);font-family:monospace;font-size:11px;flex-shrink:0}
.csubject{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.cdate{font-size:10px;color:var(--text2);flex-shrink:0}
.center{text-align:center;padding:40px;color:var(--text2)}
.error-msg{color:var(--red);text-align:center;padding:40px}
</style>
</head>
<body>
<header>
  <div class="logo"><span>l</span>dev</div>
  <div class="cwd" id="cwd-info"></div>
  <div class="spacer"></div>
  <span class="refresh-pill" id="refresh-info">—</span>
  <button class="refresh-btn" id="refresh-btn">⟳</button>
</header>
<main id="app"><div class="center">Loading dashboard…</div></main>
<script>
var lastData = null;
var countdown = 0;
var pollTimer = null;

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
  var actions = '';
  if (wt.env) {
    var startBtn = isStopped ? '<button class="action btn-start" data-name="' + safeName + '" data-action="start">▶ Start</button>' : '';
    var stopBtn = isRunning ? '<button class="action btn-stop" data-name="' + safeName + '" data-action="stop">■ Stop</button>' : '';
    actions = '<div class="actions">' + startBtn + stopBtn + '</div>';
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

  return '<div class="card">' +
    '<div class="card-header"><div><div class="card-title">' + safeName + mainLabel + '</div><div class="card-branch">' + esc(branch) + '</div></div>' +
    '<span class="badge badge-' + badge.cls + '">' + badge.label + '</span></div>' +
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
      doAction(btn.getAttribute('data-name'), btn.getAttribute('data-action'), btn);
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
