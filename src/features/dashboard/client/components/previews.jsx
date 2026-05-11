import {h} from 'preact';

import {classNames} from '../lib/dashboard-state.js';

export function DeployPreview({modules, result}) {
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

export function DoctorPreview({name, postJson, report, showToast}) {
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
