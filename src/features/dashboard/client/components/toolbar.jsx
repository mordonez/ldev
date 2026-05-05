import {h} from 'preact';

import {classNames, FILTERS} from '../lib/dashboard-state.js';

export function Toolbar({activeFilter, counts, onFilter, onSearch, query, total, visible}) {
  return (
    <div class="toolbar">
      <div class="toolbar-group">
        {FILTERS.map(([key, label]) => (
          <button class={classNames('filter-chip', activeFilter === key && 'active')} key={key} type="button" onClick={() => onFilter(key)}>
            {label} {counts[key] || 0}
          </button>
        ))}
      </div>
      <div class="toolbar-search">
        <input placeholder="Search worktrees..." value={query} onInput={(event) => onSearch(event.currentTarget.value)} />
      </div>
      <div class="toolbar-meta">
        {visible} of {total}
      </div>
    </div>
  );
}
