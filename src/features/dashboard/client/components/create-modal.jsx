import {h} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export function CreateModal({data, isOpen, onClose, onSubmit}) {
  const mainBranch = data?.worktrees?.find((wt) => wt.isMain)?.branch || '';
  const [form, setForm] = useState({
    name: '',
    baseRef: '',
    withEnv: true,
    stopMainForClone: true,
    restartMainAfterClone: false,
  });

  useEffect(() => {
    if (isOpen) {
      setForm({name: '', baseRef: mainBranch, withEnv: true, stopMainForClone: true, restartMainAfterClone: false});
    }
  }, [isOpen, mainBranch]);

  if (!isOpen) return null;

  const update = (key, value) => setForm((current) => ({...current, [key]: value}));

  return (
    <div class="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div class="modal" style={{maxWidth: '560px', maxHeight: 'none', alignSelf: 'center'}}>
        <div class="modal-header">
          <span class="modal-title">New worktree</span>
          <button class="modal-close" type="button" onClick={onClose}>
            x
          </button>
        </div>
        <div class="modal-body">
          <form
            class="create-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(form);
            }}
          >
            <div class="field">
              <label>Worktree name</label>
              <input required placeholder="feature-short-name" value={form.name} onInput={(event) => update('name', event.currentTarget.value)} />
              <div class="field-hint">This becomes .worktrees/&lt;name&gt; and the default branch fix/&lt;name&gt;.</div>
            </div>
            <div class="field">
              <label>Base ref</label>
              <input placeholder="HEAD (optional)" value={form.baseRef} onInput={(event) => update('baseRef', event.currentTarget.value)} />
            </div>
            {[
              ['withEnv', 'Prepare an isolated local environment for this worktree'],
              ['stopMainForClone', 'Stop the main environment during non-Btrfs state cloning when needed'],
              ['restartMainAfterClone', 'Restart the main environment after cloning so both runtimes can keep running'],
            ].map(([key, label]) => (
              <label class="checkbox-row" key={key}>
                <input checked={form[key]} type="checkbox" onChange={(event) => update(key, event.currentTarget.checked)} />
                <span>{label}</span>
              </label>
            ))}
            <div class="create-actions">
              <button class="btn-secondary" type="button" onClick={onClose}>
                Cancel
              </button>
              <button class="btn-primary" type="submit">
                Create worktree
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
