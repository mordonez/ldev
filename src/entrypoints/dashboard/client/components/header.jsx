import {h} from 'preact';

import {IconPlus, IconRefreshCw, IconSearch} from '../lib/icons.jsx';

export function Header({cwd, onDiagnose, onNew, onRefresh, refreshLabel, refreshPaused}) {
  return (
    <header>
      <div class="logo">
        <span>l</span>dev
      </div>
      <div class="cwd">{cwd}</div>
      <div class="spacer" />
      <button class="header-btn" type="button" onClick={onDiagnose}>
        <IconSearch size={13} />
        Diagnose repo
      </button>
      <button class="header-btn" type="button" onClick={onNew}>
        <IconPlus size={13} />
        New worktree
      </button>
      <span class="refresh-pill">{refreshLabel}</span>
      <button class="refresh-btn" disabled={refreshPaused} title="Refresh" type="button" onClick={onRefresh}>
        <IconRefreshCw size={14} />
      </button>
    </header>
  );
}
