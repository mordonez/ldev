import {h} from 'preact';

export function Maintenance({maintenance, onApply, onPreview, onSetDays}) {
  return (
    <div class="maintenance">
      <div class="maintenance-header">
        <div>
          <div class="maintenance-title">Maintenance preview</div>
          <div class="maintenance-sub">Find stale worktrees before applying cleanup.</div>
        </div>
      </div>
      <div class="maintenance-controls">
        <input min="1" type="number" value={maintenance.days} onInput={(event) => onSetDays(Number.parseInt(event.currentTarget.value, 10) || 7)} />
        <button class="btn-secondary" type="button" onClick={() => onPreview(maintenance.days)}>
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
      ) : maintenance.candidates.length ? (
        <div class="maintenance-list">
          {maintenance.candidates.map((candidate) => (
            <span class="maintenance-chip" key={candidate}>
              {candidate}
            </span>
          ))}
        </div>
      ) : (
        <div class="maintenance-empty">No stale worktrees found.</div>
      )}
    </div>
  );
}
