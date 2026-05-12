import {h} from 'preact';
import {useState} from 'preact/hooks';

export function Maintenance({maintenance, onApply, onPreview, onSetDays}) {
  const protectedWorktrees = Array.isArray(maintenance.protected) ? maintenance.protected : [];
  const [expanded, setExpanded] = useState(false);

  const handlePreview = () => {
    setExpanded(true);
    onPreview(maintenance.days);
  };

  return (
    <div class="maintenance">
      <div class="maintenance-header">
        <div>
          <div class="maintenance-title">Maintenance preview</div>
          <div class="maintenance-sub">Find stale worktrees before applying cleanup.</div>
        </div>
        <button class="maintenance-link" type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Hide maintenance' : 'Show maintenance'}
        </button>
      </div>
      {expanded ? (
        <div class="maintenance-panel">
          <div class="maintenance-controls">
            <input min="1" type="number" value={maintenance.days} onInput={(event) => onSetDays(Number.parseInt(event.currentTarget.value, 10) || 7)} />
            <button class="btn-secondary" type="button" onClick={handlePreview}>
              Preview
            </button>
            <button class="btn-primary" type="button" disabled={maintenance.candidates.length === 0 || maintenance.loading} onClick={() => onApply(maintenance.days)}>
              Apply GC
            </button>
          </div>
          {maintenance.loading ? (
            <div class="maintenance-empty">Loading maintenance preview...</div>
          ) : maintenance.error ? (
            <div class="maintenance-empty">Error: {maintenance.error}</div>
          ) : maintenance.candidates.length || protectedWorktrees.length ? (
            <div class="maintenance-results">
              {maintenance.candidates.length ? (
                <div class="maintenance-results">
                  <div class="maintenance-warning maintenance-warning-danger">
                    <strong>Apply GC removes the listed worktree directories and local runtime data.</strong> Local branches are kept.
                  </div>
                  <div class="maintenance-list">
                    {maintenance.candidates.map((candidate) => (
                      <span class="maintenance-chip" key={candidate}>
                        {candidate}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {protectedWorktrees.length ? (
                <div class="maintenance-warning">
                  <strong>Protected from GC:</strong> {protectedWorktrees.join(', ')} have uncommitted, staged, or untracked changes.
                </div>
              ) : null}
            </div>
          ) : (
            <div class="maintenance-empty">No stale worktrees found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
