import {h} from 'preact';

export function Header({cwd, onDiagnose, onNew, onRefresh, refreshLabel}) {
  return (
    <header>
      <div class="logo">
        <span>l</span>dev
      </div>
      <div class="cwd">{cwd}</div>
      <div class="spacer" />
      <button class="header-btn" type="button" onClick={onDiagnose}>
        Diagnose repo
      </button>
      <button class="header-btn" type="button" onClick={onNew}>
        + New worktree
      </button>
      <span class="refresh-pill">{refreshLabel}</span>
      <button class="refresh-btn" type="button" onClick={onRefresh}>
        Refresh
      </button>
    </header>
  );
}
