import {Fragment, h} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

import {DbFormModal} from '../components/db-form-modal.jsx';
import {Modal} from '../components/modal.jsx';
import {ModalFrame} from '../components/modal-frame.jsx';
import {DeployPreview, DoctorPreview} from '../components/previews.jsx';
import {ResourceExportModal} from '../components/resource-export-modal.jsx';
import {actionUrl, previewUrl} from './actions.ts';
import {buildDeleteWorktreeUrl, normalizeDeleteBranchCandidate} from './dashboard-action-utils.ts';

function errorBody(err) {
  return <div class="log-empty" style={{color: 'var(--red)'}}>Error: {String(err.message || err)}</div>;
}

export function useDashboardActions({fetchStatus, postJson, showToast}) {
  const [dbWorktree, setDbWorktree] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  const [restoreModal, setRestoreModal] = useState(null);
  const [logModal, setLogModal] = useState(null);
  const [logText, setLogText] = useState('');
  const [resourceWorktree, setResourceWorktree] = useState(null);
  const infoFetchAbort = useRef(null);
  const logFetchAbort = useRef(null);

  const openDeployPreview = async (name) => {
    infoFetchAbort.current?.abort();
    infoFetchAbort.current = new AbortController();
    const {signal} = infoFetchAbort.current;

    setInfoModal({
      title: `${name} - Deploy status`,
      body: <div class="maintenance-empty">Loading deploy status...</div>,
      footer: 'preview',
    });

    try {
      const res = await fetch(previewUrl(name, 'deploy-status'), {cache: 'no-store', signal});
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
      const modules = result.modules || [];
      const active = modules.filter((module) => module.state === 'ACTIVE').length;
      setInfoModal({
        title: `${name} - Deploy status`,
        footer: `${modules.length} modules - ${active} active`,
        body: <DeployPreview modules={modules} result={result} />,
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setInfoModal((current) => ({...current, body: errorBody(err)}));
    }
  };

  const openDoctor = async (name) => {
    infoFetchAbort.current?.abort();
    infoFetchAbort.current = new AbortController();
    const {signal} = infoFetchAbort.current;

    setInfoModal({
      title: `${name || 'Repository'} - Diagnose`,
      body: <div class="maintenance-empty">Loading diagnosis...</div>,
      footer: 'preview',
    });

    try {
      const url = name ? previewUrl(name, 'doctor') : '/api/doctor';
      const res = await fetch(url, {cache: 'no-store', signal});
      const report = await res.json();
      if (!res.ok) throw new Error(report.error || `HTTP ${res.status}`);
      setInfoModal({
        title: `${name || 'Repository'} - Diagnose`,
        footer: `${report.summary?.failed || 0} failed - ${report.summary?.warned || 0} warned`,
        body: <DoctorPreview name={name} postJson={postJson} report={report} showToast={showToast} />,
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
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
    logFetchAbort.current?.abort();
    logFetchAbort.current = new AbortController();
    const {signal} = logFetchAbort.current;

    setLogModal({name});
    setLogText('Loading...');
    try {
      const res = await fetch(`/api/worktrees/${encodeURIComponent(name)}/logs`, {signal});
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setLogText(body.logs || 'No logs available.');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setLogText(`Error: ${String(err.message || err)}`);
    }
  };

  const copyPath = (path) => {
    showToast(`Copied: cd ${path}`);
  };

  const deleteWorktree = (name, branch) => {
    setDeleteModal({
      branch: normalizeDeleteBranchCandidate(branch),
      busy: false,
      deleteBranch: false,
      name,
    });
    return true;
  };

  const restoreWorktree = (name) => {
    setRestoreModal({name, busy: false});
  };

  const confirmRestoreWorktree = async () => {
    if (!restoreModal?.name || restoreModal.busy) return;
    setRestoreModal((current) => (current ? {...current, busy: true} : current));
    try {
      await postJson(actionUrl(restoreModal.name, 'restore'));
      setRestoreModal(null);
      showToast(`Queued: restore ${restoreModal.name}`);
      setTimeout(fetchStatus, 400);
    } catch (err) {
      setRestoreModal((current) => (current ? {...current, busy: false} : current));
      showToast(`Error: ${String(err.message || err)}`);
    }
  };

  const confirmDeleteWorktree = async () => {
    if (!deleteModal?.name || deleteModal.busy) {
      return;
    }

    const request = {
      deleteBranch: Boolean(deleteModal.branch && deleteModal.deleteBranch),
      name: deleteModal.name,
    };

    setDeleteModal((current) => (current ? {...current, busy: true} : current));

    try {
      await fetch(buildDeleteWorktreeUrl(request.name, request.deleteBranch), {method: 'DELETE'});
      setDeleteModal(null);
      showToast(`Delete queued: ${request.name}`);
      setTimeout(fetchStatus, 400);
    } catch (err) {
      setDeleteModal((current) => (current ? {...current, busy: false} : current));
      showToast(`Error: ${String(err.message || err)}`);
    }
  };

  return {
    closeDbModal: () => setDbWorktree(null),
    closeDeleteModal: () => setDeleteModal(null),
    closeInfoModal: () => { infoFetchAbort.current?.abort(); setInfoModal(null); },
    closeLogModal: () => { logFetchAbort.current?.abort(); setLogModal(null); },
    closeResourceModal: () => setResourceWorktree(null),
    confirmDeleteWorktree,
    copyPath,
    dbWorktree,
    deleteModal,
    deleteWorktree,
    hasOpenModal: Boolean(dbWorktree || deleteModal || infoModal || logModal || resourceWorktree || restoreModal),
    infoModal,
    logModal,
    logText,
    closeRestoreModal: () => setRestoreModal(null),
    confirmRestoreWorktree,
    openDbModal: setDbWorktree,
    openDoctor,
    openLogs,
    openResourceModal: setResourceWorktree,
    resourceWorktree,
    restoreModal,
    restoreWorktree,
    runAction,
    setDeleteModal,
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
      <DeleteWorktreeModal
        isOpen={Boolean(actions.deleteModal)}
        onClose={actions.closeDeleteModal}
        onConfirm={actions.confirmDeleteWorktree}
        onToggleDeleteBranch={(checked) =>
          actions.setDeleteModal((current) => (current ? {...current, deleteBranch: checked} : current))
        }
        value={actions.deleteModal}
      />
      <RestoreWorktreeModal
        isOpen={Boolean(actions.restoreModal)}
        onClose={actions.closeRestoreModal}
        onConfirm={actions.confirmRestoreWorktree}
        value={actions.restoreModal}
      />
      <Modal
        footer={`${actions.logText.split('\n').filter(Boolean).length} lines`}
        isOpen={Boolean(actions.logModal)}
        onClose={actions.closeLogModal}
        onRefresh={() => actions.logModal && actions.openLogs(actions.logModal.name)}
        title={actions.logModal ? `${actions.logModal.name} - liferay logs` : 'Logs'}
      >
        <LogViewer text={actions.logText} />
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

function DeleteWorktreeModal({isOpen, onClose, onConfirm, onToggleDeleteBranch, value}) {
  if (!isOpen || !value) {
    return null;
  }

  return (
    <ModalFrame maxWidth="560px" onClose={value.busy ? () => {} : onClose} subtitle={value.name} title="Delete worktree">
      <form
        class="create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onConfirm();
        }}
      >
        <div class="field-hint">
          This queues the removal of the worktree directory and its local runtime data. Local git history stays intact unless you also delete the branch.
        </div>
        {value.branch ? (
          <label class="checkbox-row">
            <input
              checked={value.deleteBranch}
              type="checkbox"
              onChange={(event) => onToggleDeleteBranch(event.currentTarget.checked)}
            />
            <span>Also delete the local git branch "{value.branch}"</span>
          </label>
        ) : (
          <div class="field-hint">No local branch name was detected for this worktree, so only the worktree will be removed.</div>
        )}
        <div class="delete-modal-note">This action is queued asynchronously. You can keep using the dashboard while cleanup runs.</div>
        <div class="create-actions">
          <button class="btn-secondary" disabled={value.busy} type="button" onClick={onClose}>
            Cancel
          </button>
          <button class="btn-primary btn-danger" disabled={value.busy} type="submit">
            {value.busy ? 'Queueing...' : 'Delete worktree'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function RestoreWorktreeModal({isOpen, onClose, onConfirm, value}) {
  if (!isOpen || !value) return null;

  return (
    <ModalFrame maxWidth="560px" onClose={value.busy ? () => {} : onClose} subtitle={value.name} title="Restore environment">
      <form
        class="create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onConfirm();
        }}
      >
        <div class="field-hint">
          This will replace all environment data (database, Liferay data, Elasticsearch, Document Library) with data from the main environment. The environment will restart automatically. This action cannot be undone.
        </div>
        <div class="create-actions">
          <button class="btn-secondary" disabled={value.busy} type="button" onClick={onClose}>
            Cancel
          </button>
          <button class="btn-primary btn-danger" disabled={value.busy} type="submit">
            {value.busy ? 'Queueing...' : 'Restore environment'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function LogViewer({text}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return <pre class="log-pre" ref={ref}>{text}</pre>;
}
