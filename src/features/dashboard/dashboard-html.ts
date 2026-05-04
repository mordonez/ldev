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
.header-btn{background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.28);color:var(--blue);padding:5px 11px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;transition:opacity .15s}
.header-btn:hover{opacity:.85}
.refresh-btn{background:var(--bg3);border:1px solid var(--border);color:var(--text2);padding:3px 8px;border-radius:6px;cursor:pointer;font-size:13px}
.refresh-btn:hover{color:var(--text)}
main{padding:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
.toolbar-group{display:flex;flex-wrap:wrap;gap:8px}
.toolbar-search{min-width:220px;flex:1;max-width:320px}
.toolbar-search input{width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:10px;font-size:12px}
.toolbar-search input::placeholder{color:var(--text2)}
.toolbar-meta{font-size:12px;color:var(--text2)}
.maintenance{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
.maintenance-header{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.maintenance-title{font-size:13px;font-weight:700}
.maintenance-sub{font-size:11px;color:var(--text2)}
.maintenance-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.maintenance-controls input{width:84px;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:7px;font-size:12px}
.maintenance-list{display:flex;flex-wrap:wrap;gap:8px}
.maintenance-chip{font-size:11px;color:var(--text);background:var(--bg3);border:1px solid var(--border);padding:4px 9px;border-radius:999px}
.maintenance-empty{font-size:12px;color:var(--text2)}
.insight-stack{display:flex;flex-direction:column;gap:12px}
.insight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.insight-card{background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px}
.insight-label{font-size:11px;color:var(--text2);margin-bottom:4px}
.insight-value{font-size:14px;font-weight:700;color:var(--text)}
.insight-sub{font-size:11px;color:var(--text2);margin-top:4px;line-height:1.4}
.insight-list{display:flex;flex-direction:column;gap:8px}
.insight-row{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;font-size:12px}
.insight-row-main{display:flex;flex-direction:column;gap:3px}
.insight-row-meta{font-size:11px;color:var(--text2)}
.status-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;border:1px solid var(--border)}
.status-pass,.status-active{color:var(--green);border-color:rgba(63,185,80,.35);background:rgba(63,185,80,.08)}
.status-warn,.status-deployed{color:#d29922;border-color:rgba(210,153,34,.35);background:rgba(210,153,34,.08)}
.status-fail{color:var(--red);border-color:rgba(248,81,73,.35);background:rgba(248,81,73,.08)}
.status-skip{color:var(--text2)}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
.modal-note{font-size:11px;color:var(--text2)}
.filter-chip{background:var(--bg2);border:1px solid var(--border);color:var(--text2);padding:5px 10px;border-radius:999px;cursor:pointer;font-size:12px;font-weight:600;transition:all .15s}
.filter-chip:hover{color:var(--text);border-color:rgba(88,166,255,.28)}
.filter-chip.active{background:rgba(88,166,255,.12);color:var(--blue);border-color:rgba(88,166,255,.32)}
.dashboard-stack{display:flex;flex-direction:column;gap:10px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}
.stack{display:flex;flex-direction:column;gap:14px}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.card-meta{flex:1;min-width:0}
.card-title{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-main-label{font-size:11px;color:var(--text2);font-weight:400;margin-left:5px}
.card-branch{font-size:11px;color:var(--text2);font-family:monospace;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-badges{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.card-badge-row{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}
.badge{font-size:11px;font-weight:500;padding:2px 9px;border-radius:10px;white-space:nowrap}
.badge-green{background:rgba(63,185,80,.15);color:var(--green)}
.badge-yellow{background:rgba(210,153,34,.15);color:var(--yellow)}
.badge-red{background:rgba(248,81,73,.15);color:var(--red)}
.badge-gray{background:rgba(139,148,158,.12);color:var(--text2)}
.badge-blue{background:rgba(88,166,255,.14);color:var(--blue)}
.ahead-behind{font-size:11px;color:var(--text2);display:flex;gap:5px;align-items:center}
.ahead{color:var(--green)}
.behind{color:var(--yellow)}
.path-row{display:flex;align-items:center;gap:4px;min-width:0}
.path-text{font-size:11px;color:var(--text2);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.btn-copy{background:none;border:1px solid var(--border);color:var(--text2);padding:2px 6px;border-radius:5px;cursor:pointer;font-size:10px;flex-shrink:0;transition:all .15s}
.btn-copy:hover{color:var(--text);border-color:var(--text2)}
.btn-copy.copied{color:var(--green);border-color:rgba(63,185,80,.4)}
.services{display:flex;flex-wrap:wrap;gap:5px}
.detail-section{display:flex;flex-direction:column;gap:6px}
.card-panel-stack{display:flex;flex-direction:column;gap:8px}
.card-panel{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.018)}
.card-panel-priority{border-color:rgba(88,166,255,.28);background:linear-gradient(180deg,rgba(88,166,255,.08),rgba(88,166,255,.03))}
.card-panel-priority .card-panel-title{color:var(--blue)}
.card-panel-priority .detail-meta{color:#b3c6d9}
.card-panel-header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px}
.card-panel-title{font-size:11px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.card-chip-row{display:flex;flex-wrap:wrap;gap:6px}
.card-chip{background:var(--bg3);border:1px solid var(--border);color:var(--text2);padding:5px 9px;border-radius:999px;cursor:pointer;font-size:10px;font-weight:700;letter-spacing:.02em}
.card-chip:hover{color:var(--text);border-color:rgba(88,166,255,.28)}
.card-chip.active{background:rgba(88,166,255,.12);border-color:rgba(88,166,255,.32);color:var(--blue)}
.card-chip-green{color:var(--green);border-color:rgba(63,185,80,.32);background:rgba(63,185,80,.08)}
.card-chip-yellow{color:var(--yellow);border-color:rgba(210,153,34,.32);background:rgba(210,153,34,.08)}
.card-chip-red{color:var(--red);border-color:rgba(248,81,73,.34);background:rgba(248,81,73,.08)}
.card-chip-blue{color:var(--blue);border-color:rgba(88,166,255,.32);background:rgba(88,166,255,.08)}
.card-chip-count{color:inherit;opacity:.82}
.card-preview-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:7px 9px;border:1px solid var(--border);border-radius:8px;background:rgba(88,166,255,.05)}
.card-preview-label{font-size:10px;color:var(--text2);font-weight:700;letter-spacing:.05em;text-transform:uppercase;flex-shrink:0;padding-top:1px}
.commit-preview{display:flex;align-items:baseline;gap:7px;min-width:0;flex:1}
.commit-preview-subject{font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.card-preview-meta{font-size:11px;color:var(--text2);flex-shrink:0}
.detail-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--text2);text-transform:none;letter-spacing:0}
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
.actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.actions-spacer{flex:1}
button.action{padding:4px 10px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:11px;font-weight:500;line-height:1.2;transition:opacity .15s}
.action-link{display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:6px;border:1px solid rgba(88,166,255,.35);background:rgba(88,166,255,.16);color:var(--text);text-decoration:none;font-size:11px;font-weight:600;line-height:1.2;transition:opacity .15s}
.action-link:hover{opacity:.82}
button.action:hover{opacity:.82}
button.action:disabled{opacity:.45;cursor:not-allowed}
.btn-start{background:rgba(63,185,80,.12);color:var(--green);border-color:rgba(63,185,80,.3)}
.btn-stop{background:rgba(248,81,73,.12);color:var(--red);border-color:rgba(248,81,73,.3)}
.btn-logs{background:rgba(139,148,158,.1);color:var(--text2);border-color:var(--border)}
.btn-logs:hover{color:var(--text);opacity:1}
.btn-delete{background:none;border:1px solid transparent;color:var(--text2);padding:4px 7px;border-radius:6px;cursor:pointer;font-size:11px;transition:all .15s}
.btn-delete:hover{color:var(--red);border-color:rgba(248,81,73,.3);background:rgba(248,81,73,.08)}
.no-env{font-size:11px;color:var(--text2)}
.commits{border-top:1px solid var(--border);padding-top:6px;display:flex;flex-direction:column;gap:3px}
.commits-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}
.commits-label{font-size:11px;color:var(--text2);font-weight:500;text-transform:uppercase;letter-spacing:.04em}
.changed{font-size:11px;color:var(--yellow)}
.changed-files{display:flex;flex-direction:column;gap:6px}
.changed-file{padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:rgba(210,153,34,.06)}
.changed-file-path{font-size:11px;color:var(--text);font-family:monospace;word-break:break-all;line-height:1.45}
.changed-file-more{font-size:11px;color:var(--text2)}
.commit{display:flex;gap:7px;align-items:baseline}
.chash{color:var(--blue);font-family:monospace;font-size:11px;flex-shrink:0}
.csubject{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.cdate{font-size:10px;color:var(--text2);flex-shrink:0}
.btn-ghost{background:rgba(188,140,255,.1);color:var(--text);border-color:rgba(188,140,255,.24)}
.center{text-align:center;padding:40px;color:var(--text2)}
.error-msg{color:var(--red);text-align:center;padding:40px}

/* Toast */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 18px;border-radius:8px;font-size:13px;z-index:200;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}
.toast.visible{opacity:1;transform:translateX(-50%) translateY(0)}

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

/* Task activity */
.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
.activity{position:sticky;top:76px;background:linear-gradient(180deg,rgba(22,27,34,.96),rgba(13,17,23,.98));border:1px solid var(--border);border-radius:12px;overflow:hidden;backdrop-filter:blur(14px);box-shadow:0 10px 24px rgba(0,0,0,.18)}
.activity.is-collapsed .activity-body{display:none}
.activity-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border)}
.activity.is-collapsed .activity-header{border-bottom:none}
.activity-title{font-size:13px;font-weight:700;letter-spacing:.02em}
.activity-meta{font-size:11px;color:var(--text2)}
.activity-toggle{background:none;border:1px solid var(--border);color:var(--text2);padding:4px 8px;border-radius:999px;cursor:pointer;font-size:11px;font-weight:600}
.activity-toggle:hover{color:var(--text);border-color:rgba(88,166,255,.28)}
.activity-body{max-height:calc(100vh - 120px);overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
.task-card{border:1px solid var(--border);border-radius:10px;background:rgba(13,17,23,.72);overflow:hidden}
.task-card.running{border-color:rgba(88,166,255,.35);box-shadow:0 0 0 1px rgba(88,166,255,.08) inset}
.task-card.succeeded{border-color:rgba(63,185,80,.28)}
.task-card.failed{border-color:rgba(248,81,73,.35)}
.task-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 11px;border-bottom:1px solid rgba(48,54,61,.7)}
.task-title{font-size:12px;font-weight:600;line-height:1.4}
.task-sub{font-size:11px;color:var(--text2);margin-top:3px}
.task-status{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 7px;border-radius:999px;border:1px solid var(--border)}
.task-status.running{color:var(--blue);border-color:rgba(88,166,255,.28);background:rgba(88,166,255,.1)}
.task-status.succeeded{color:var(--green);border-color:rgba(63,185,80,.28);background:rgba(63,185,80,.1)}
.task-status.failed{color:var(--red);border-color:rgba(248,81,73,.28);background:rgba(248,81,73,.1)}
.task-log{padding:10px 11px;display:flex;flex-direction:column;gap:7px;max-height:220px;overflow-y:auto}
.task-line{display:grid;grid-template-columns:46px 1fr;gap:8px;font-family:'Cascadia Code','Fira Code','JetBrains Mono',monospace;font-size:11px;line-height:1.5;color:#c9d1d9}
.task-line.error .task-msg{color:#ffb3ad}
.task-time{color:var(--text2)}
.task-empty{padding:24px 16px;color:var(--text2);font-size:12px;text-align:center}

/* Create worktree modal */
.create-form{display:flex;flex-direction:column;gap:12px}
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:12px;color:var(--text2);font-weight:500}
.field input[type="text"]{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 10px;border-radius:7px;font-size:13px}
.field-hint{font-size:11px;color:var(--text2);line-height:1.4}
.checkbox-row{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text)}
.checkbox-row input{margin-top:2px}
.create-error{font-size:12px;color:var(--red);min-height:16px}
.create-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
.btn-secondary{background:none;border:1px solid var(--border);color:var(--text2);padding:7px 11px;border-radius:7px;cursor:pointer;font-size:12px}
.btn-secondary:hover{color:var(--text)}
.btn-primary{background:var(--blue);border:1px solid rgba(88,166,255,.35);color:#08111b;padding:7px 12px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.action:disabled,.btn-delete:disabled,.btn-secondary:disabled{opacity:.5;cursor:not-allowed;pointer-events:none}
.segmented{display:flex;flex-wrap:wrap;gap:8px}
.segmented-btn{background:var(--bg3);border:1px solid var(--border);color:var(--text2);padding:6px 10px;border-radius:999px;cursor:pointer;font-size:12px;font-weight:600}
.segmented-btn.active{background:rgba(88,166,255,.12);border-color:rgba(88,166,255,.32);color:var(--blue)}
.field textarea{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:9px 10px;border-radius:7px;font-size:13px;min-height:120px;resize:vertical}
.field.hidden{display:none}

@media (max-width: 720px){
  .layout{grid-template-columns:1fr}
  .activity{position:static}
  .activity-body{max-height:none}
  header{flex-wrap:wrap}
  .cwd{max-width:none;width:100%;order:3}
}
</style>
</head>
<body>
<header>
  <div class="logo"><span>l</span>dev</div>
  <div class="cwd" id="cwd-info"></div>
  <div class="spacer"></div>
  <button class="header-btn" id="diagnose-btn" title="Diagnose the current repository">Diagnose repo</button>
  <button class="header-btn" id="new-worktree-btn" title="Create a new worktree">+ New worktree</button>
  <span class="refresh-pill" id="refresh-info">—</span>
  <button class="refresh-btn" id="refresh-btn" title="Refresh now">⟳</button>
</header>
<main>
  <div class="layout">
    <section id="app"><div class="center">Loading dashboard…</div></section>
    <aside class="activity is-collapsed" id="activity-panel">
      <div class="activity-header">
        <div>
          <div class="activity-title">Activity</div>
          <div class="activity-meta" id="task-summary">No active tasks</div>
        </div>
        <button class="activity-toggle" id="activity-toggle" type="button" aria-expanded="false">Show</button>
      </div>
      <div class="activity-body" id="task-list">
        <div class="task-empty">Long-running actions will stream here.</div>
      </div>
    </aside>
  </div>
</main>

<div class="toast" id="toast"></div>

<div class="modal-overlay hidden" id="create-overlay">
  <div class="modal" id="create-modal" style="max-width:560px;max-height:none;align-self:center">
    <div class="modal-header">
      <span class="modal-title">New worktree</span>
      <button class="modal-close" id="create-close" title="Close (Esc)">✕</button>
    </div>
    <div class="modal-body">
      <form class="create-form" id="create-form">
        <div class="field">
          <label for="create-name">Worktree name</label>
          <input id="create-name" name="name" type="text" placeholder="feature-short-name" required>
          <div class="field-hint">This becomes <code>.worktrees/&lt;name&gt;</code> and the default branch <code>fix/&lt;name&gt;</code>.</div>
        </div>
        <div class="field">
          <label for="create-base">Base ref</label>
          <input id="create-base" name="baseRef" type="text" placeholder="HEAD (optional)">
          <div class="field-hint">Defaults to the branch checked out in the main worktree. Change it here when the new worktree should start from another ref.</div>
        </div>
        <label class="checkbox-row">
          <input id="create-with-env" name="withEnv" type="checkbox" checked>
          <span>Prepare an isolated local environment for this worktree</span>
        </label>
        <label class="checkbox-row">
          <input id="create-stop-main" name="stopMainForClone" type="checkbox" checked>
          <span>Stop the main environment during non-Btrfs state cloning when needed</span>
        </label>
        <label class="checkbox-row">
          <input id="create-restart-main" name="restartMainAfterClone" type="checkbox">
          <span>Restart the main environment after cloning so both runtimes can keep running</span>
        </label>
        <div class="create-error" id="create-error"></div>
        <div class="create-actions">
          <button type="button" class="btn-secondary" id="create-cancel">Cancel</button>
          <button type="submit" class="btn-primary" id="create-submit">Create worktree</button>
        </div>
      </form>
    </div>
  </div>
</div>

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

<div class="modal-overlay hidden" id="db-overlay">
  <div class="modal" id="db-modal" style="max-width:620px;max-height:none;align-self:center">
    <div class="modal-header">
      <span class="modal-title" id="db-title">DB tools</span>
      <span class="modal-subtitle" id="db-subtitle"></span>
      <button class="modal-close" id="db-close" title="Close (Esc)">✕</button>
    </div>
    <div class="modal-body">
      <form class="create-form" id="db-form">
        <div class="segmented" id="db-action-picker">
          <button type="button" class="segmented-btn active" data-db-action="download">Download</button>
          <button type="button" class="segmented-btn" data-db-action="sync">Sync</button>
          <button type="button" class="segmented-btn" data-db-action="import">Import</button>
          <button type="button" class="segmented-btn" data-db-action="query">Query</button>
        </div>
        <div class="field" id="db-environment-field">
          <label for="db-environment">Environment (Liferay Cloud)</label>
          <input id="db-environment" name="environment" type="text" placeholder="prd" />
        </div>
        <div class="field hidden" id="db-file-field">
          <label for="db-file">File path</label>
          <input id="db-file" name="file" type="text" placeholder="Optional path to .sql/.gz/.dump" />
          <div class="field-hint" id="db-file-hint">Leave empty to autodetect the newest backup.</div>
        </div>
        <label class="checkbox-row hidden" id="db-force-row">
          <input id="db-force" name="force" type="checkbox" checked>
          <span id="db-force-label">Force overwrite of the local database</span>
        </label>
        <div class="field hidden" id="db-query-field">
          <label for="db-query">SQL query</label>
          <textarea id="db-query" name="query" placeholder="select current_database();"></textarea>
          <div class="field-hint">Provide inline SQL or a file path below.</div>
        </div>
        <div class="create-error" id="db-error"></div>
        <div class="create-actions">
          <button type="button" class="btn-secondary" id="db-cancel">Cancel</button>
          <button type="submit" class="btn-primary" id="db-submit">Run download</button>
        </div>
      </form>
    </div>
  </div>
</div>

<div class="modal-overlay hidden" id="resource-overlay">
  <div class="modal" id="resource-modal" style="max-width:560px;max-height:none;align-self:center">
    <div class="modal-header">
      <span class="modal-title" id="resource-title">Resource export</span>
      <span class="modal-subtitle" id="resource-subtitle"></span>
      <button class="modal-close" id="resource-close" title="Close (Esc)">✕</button>
    </div>
    <div class="modal-body">
      <form class="create-form" id="resource-form">
        <div class="field-hint">Export the selected resources for all accessible sites in this environment.</div>
        <label class="checkbox-row">
          <input id="resource-templates" type="checkbox" value="templates" data-resource-kind checked>
          <span>Templates</span>
        </label>
        <label class="checkbox-row">
          <input id="resource-structures" type="checkbox" value="structures" data-resource-kind checked>
          <span>Structures</span>
        </label>
        <label class="checkbox-row">
          <input id="resource-adts" type="checkbox" value="adts" data-resource-kind checked>
          <span>ADTs</span>
        </label>
        <label class="checkbox-row">
          <input id="resource-fragments" type="checkbox" value="fragments" data-resource-kind checked>
          <span>Fragments</span>
        </label>
        <div class="create-error" id="resource-error"></div>
        <div class="create-actions">
          <button type="button" class="btn-secondary" id="resource-cancel">Cancel</button>
          <button type="submit" class="btn-primary" id="resource-submit">Export selected</button>
        </div>
      </form>
    </div>
  </div>
</div>

<script>
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
</script>
</body>
</html>`;
