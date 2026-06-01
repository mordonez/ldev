import {h} from 'preact';
import {useState} from 'preact/hooks';

import {cx} from '../lib/cx.js';
import {ModalFrame} from './modal-frame.jsx';

export function DbFormModal({isOpen, onClose, onSubmit, worktreeName}) {
  const [dbAction, setDbAction] = useState('sync');
  const [form, setForm] = useState({backupId: '', environment: '', file: '', force: true, project: '', query: ''});
  if (!isOpen) return null;

  const submit = (event) => {
    event.preventDefault();
    onSubmit(worktreeName, dbAction, form);
  };

  return (
    <ModalFrame maxWidth="620px" onClose={onClose} subtitle={worktreeName} title="DB tools">
      <form class="create-form" onSubmit={submit}>
        <div class="segmented">
          {['download', 'sync', 'import', 'query'].map((action) => (
            <button class={cx('segmented-btn', dbAction === action && 'active')} key={action} type="button" onClick={() => setDbAction(action)}>
              {action[0].toUpperCase() + action.slice(1)}
            </button>
          ))}
        </div>
        {dbAction === 'download' || dbAction === 'sync' ? (
          <div class="db-sync-fields">
            <div class="field">
              <label>Project</label>
              <input placeholder="From docker/.env" value={form.project} onInput={(event) => setForm((current) => ({...current, project: event.currentTarget.value}))} />
            </div>
            <div class="field">
              <label>Environment</label>
              <input placeholder="prd" value={form.environment} onInput={(event) => setForm((current) => ({...current, environment: event.currentTarget.value}))} />
            </div>
            <div class="field">
              <label>Backup ID</label>
              <input placeholder="Latest successful backup" value={form.backupId} onInput={(event) => setForm((current) => ({...current, backupId: event.currentTarget.value}))} />
              <div class="field-hint">Empty uses the latest successful LCP backup. Re-running sync with the same backup ID imports the same data.</div>
            </div>
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
        <div class="create-actions">
          <button class="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button class="btn-primary" type="submit">
            Run {dbAction}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
