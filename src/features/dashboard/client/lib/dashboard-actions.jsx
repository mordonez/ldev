import {Fragment, h} from 'preact';
import {useState} from 'preact/hooks';

import {DbFormModal} from '../components/db-form-modal.jsx';
import {Modal} from '../components/modal.jsx';
import {DeployPreview, DoctorPreview} from '../components/previews.jsx';
import {ResourceExportModal} from '../components/resource-export-modal.jsx';
import {actionUrl, previewUrl} from './actions.ts';

function errorBody(err) {
  return <div class="log-empty" style={{color: 'var(--red)'}}>Error: {String(err.message || err)}</div>;
}

export function useDashboardActions({fetchStatus, postJson, showToast}) {
  const [dbWorktree, setDbWorktree] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  const [logModal, setLogModal] = useState(null);
  const [logText, setLogText] = useState('');
  const [resourceWorktree, setResourceWorktree] = useState(null);

  const openDeployPreview = async (name) => {
    setInfoModal({
      title: `${name} - Deploy status`,
      body: <div class="maintenance-empty">Loading deploy status...</div>,
      footer: 'preview',
    });

    try {
      const res = await fetch(previewUrl(name, 'deploy-status'), {cache: 'no-store'});
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
      setInfoModal((current) => ({...current, body: errorBody(err)}));
    }
  };

  const openDoctor = async (name) => {
    setInfoModal({
      title: `${name || 'Repository'} - Diagnose`,
      body: <div class="maintenance-empty">Loading diagnosis...</div>,
      footer: 'preview',
    });

    try {
      const url = name ? previewUrl(name, 'doctor') : '/api/doctor';
      const res = await fetch(url, {cache: 'no-store'});
      const report = await res.json();
      if (!res.ok) throw new Error(report.error || `HTTP ${res.status}`);
      setInfoModal({
        title: `${name || 'Repository'} - Diagnose`,
        footer: `${report.summary?.failed || 0} failed - ${report.summary?.warned || 0} warned`,
        body: <DoctorPreview name={name} postJson={postJson} report={report} showToast={showToast} />,
      });
    } catch (err) {
      setInfoModal((current) => ({...current, body: errorBody(err)}));
    }
  };

  const runAction = async (name, action, button) => {
    if (action === 'doctor') return openDoctor(name);
    if (action === 'deploy-status') return openDeployPreview(name);
    if (button) button.disabled = true;
    try {
      await postJson(actionUrl(name, action));
      showToast(`Queued: ${action} ${name}`);
      setTimeout(fetchStatus, 400);
    } catch (err) {
      showToast(`Error: ${String(err.message || err)}`);
    } finally {
      if (button) button.disabled = false;
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

  const deleteWorktree = (name) =>
    confirm(`Delete worktree "${name}"?`) &&
    fetch(`/api/worktrees/${encodeURIComponent(name)}`, {method: 'DELETE'}).then(() => showToast(`Delete queued: ${name}`));

  return {
    closeDbModal: () => setDbWorktree(null),
    closeInfoModal: () => setInfoModal(null),
    closeLogModal: () => setLogModal(null),
    closeResourceModal: () => setResourceWorktree(null),
    copyPath,
    dbWorktree,
    deleteWorktree,
    infoModal,
    logModal,
    logText,
    openDbModal: setDbWorktree,
    openDoctor,
    openLogs,
    openResourceModal: setResourceWorktree,
    resourceWorktree,
    runAction,
  };
}

export function DashboardActionModals({actions, postJson, showToast}) {
  return (
    <>
      <DbFormModal
        isOpen={Boolean(actions.dbWorktree)}
        onClose={actions.closeDbModal}
        onSubmit={(name, action, payload) =>
          postJson(`/api/worktrees/${encodeURIComponent(name)}/db/${action}`, payload).then(() => {
            actions.closeDbModal();
            showToast(`Queued: DB ${action}`);
          })
        }
        worktreeName={actions.dbWorktree}
      />
      <ResourceExportModal
        isOpen={Boolean(actions.resourceWorktree)}
        onClose={actions.closeResourceModal}
        onSubmit={(name, resources) =>
          postJson(`/api/worktrees/${encodeURIComponent(name)}/resource/export`, {resources}).then(() => {
            actions.closeResourceModal();
            showToast('Queued: resource export');
          })
        }
        worktreeName={actions.resourceWorktree}
      />
      <Modal
        footer={`${actions.logText.split('\n').filter(Boolean).length} lines`}
        isOpen={Boolean(actions.logModal)}
        onClose={actions.closeLogModal}
        onRefresh={() => actions.logModal && actions.openLogs(actions.logModal.name)}
        title={actions.logModal ? `${actions.logModal.name} - liferay logs` : 'Logs'}
      >
        <pre class="log-pre">{actions.logText}</pre>
      </Modal>
      <Modal
        footer={actions.infoModal?.footer}
        isOpen={Boolean(actions.infoModal)}
        onClose={actions.closeInfoModal}
        title={actions.infoModal?.title || ''}
      >
        {actions.infoModal?.body}
      </Modal>
    </>
  );
}
