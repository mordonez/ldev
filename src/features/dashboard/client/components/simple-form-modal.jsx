import {Fragment, h} from 'preact';
import {useState} from 'preact/hooks';

import {classNames} from '../lib/dashboard-state.js';

export function SimpleFormModal({isOpen, onClose, onSubmit, title, worktreeName, type}) {
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
              <ResourceFields selected={selected} setSelected={setSelected} />
            ) : (
              <DbFields dbAction={dbAction} form={form} setDbAction={setDbAction} setForm={setForm} />
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

function ResourceFields({selected, setSelected}) {
  return (
    <Fragment>
      <div class="field-hint">Export the selected resources for all accessible sites in this environment.</div>
      {Object.keys(selected).map((kind) => (
        <label class="checkbox-row" key={kind}>
          <input checked={selected[kind]} type="checkbox" onChange={(event) => setSelected((current) => ({...current, [kind]: event.currentTarget.checked}))} />
          <span>{kind[0].toUpperCase() + kind.slice(1)}</span>
        </label>
      ))}
    </Fragment>
  );
}

function DbFields({dbAction, form, setDbAction, setForm}) {
  return (
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
  );
}
