import {h} from 'preact';

import {IconFolder, IconMoon, IconPlus, IconRefreshCw, IconSearch, IconStethoscope, IconSun} from '../lib/icons.jsx';

export function Header({cwd, onDiagnose, onNew, onRefresh, onSearch, onToggleTheme, query, refreshLabel, refreshPaused, theme}) {
  return (
    <header class="hdr">
      <div class="brand">
        <div class="brand-mark">l</div>
        <div class="brand-name">ldev</div>
      </div>
      <div class="repo-chip" title={cwd}>
        <IconFolder size={14} />
        <span class="path">{cwd}</span>
      </div>
      <div class="hdr-spacer" />
      <div class="hdr-search">
        <IconSearch size={15} />
        <input placeholder="Search worktrees…" value={query} onInput={(e) => onSearch(e.currentTarget.value)} />
      </div>
      <div class={`refresh-pill${refreshPaused ? ' refresh-paused' : ''}`} title={refreshLabel}>
        <span class="refresh-live" />
        <span>{refreshLabel}</span>
      </div>
      <button class="icon-btn" disabled={refreshPaused} title="Refresh now" type="button" onClick={onRefresh}>
        <IconRefreshCw size={15} />
      </button>
      <button class="icon-btn" title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} type="button" onClick={onToggleTheme}>
        {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
      </button>
      <button class="btn btn-ghost" type="button" onClick={onDiagnose}>
        <IconStethoscope size={15} />Diagnose
      </button>
      <button class="btn btn-primary" type="button" onClick={onNew}>
        <IconPlus size={15} />New worktree
      </button>
    </header>
  );
}
