import {h} from 'preact';
import {useState} from 'preact/hooks';

import {ModalFrame} from './modal-frame.jsx';

const resourceDefaults = {templates: true, structures: true, adts: true, fragments: true};

export function ResourceExportModal({isOpen, onClose, onSubmit, worktreeName}) {
  const [selected, setSelected] = useState(resourceDefaults);
  if (!isOpen) return null;

  const submit = (event) => {
    event.preventDefault();
    onSubmit(
      worktreeName,
      Object.entries(selected)
        .filter(([, value]) => value)
        .map(([key]) => key),
    );
  };

  return (
    <ModalFrame maxWidth="560px" onClose={onClose} subtitle={worktreeName} title="Resource export">
      <form class="create-form" onSubmit={submit}>
        <div class="field-hint">Export the selected resources for all accessible sites in this environment.</div>
        {Object.keys(selected).map((kind) => (
          <label class="checkbox-row" key={kind}>
            <input checked={selected[kind]} type="checkbox" onChange={(event) => setSelected((current) => ({...current, [kind]: event.currentTarget.checked}))} />
            <span>{kind[0].toUpperCase() + kind.slice(1)}</span>
          </label>
        ))}
        <div class="create-actions">
          <button class="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button class="btn-primary" type="submit">
            Export selected
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
