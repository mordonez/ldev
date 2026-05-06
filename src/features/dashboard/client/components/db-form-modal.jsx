import {h} from 'preact';
import {useState} from 'preact/hooks';

import {classNames} from '../lib/dashboard-state.js';
import {ModalFrame} from './modal-frame.jsx';

export function DbFormModal({isOpen, onClose, onSubmit, worktreeName}) {
  const [dbAction, setDbAction] = useState('download');
  const [form, setForm] = useState({environment: '', file: '', force: true, query: ''});
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
