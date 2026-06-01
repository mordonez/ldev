import {h} from 'preact';

import {FILTERS} from '../lib/dashboard-state.js';

const FILTER_LABELS = {
  all: 'All',
  attention: 'Attention',
  running: 'Running',
  dirty: 'Dirty',
  up: 'Up',
  main: 'Main',
};

export function Toolbar({activeFilter, counts, onFilter, onSort, sort, total, visible}) {
  return (
    <div class="toolbar">
      <div class="segmented">
        {FILTERS.map(([key]) => (
          <button class={`seg${activeFilter === key ? ' active' : ''}`} key={key} type="button" onClick={() => onFilter(key)}>
            {FILTER_LABELS[key] || key}
            <span class="badge-n">{counts[key] || 0}</span>
          </button>
        ))}
      </div>
      <div class="toolbar-spacer" />
      <span class="toolbar-meta">{visible} of {total}</span>
      <select class="sort-select" value={sort} onChange={(e) => onSort(e.currentTarget.value)}>
        <option value="priority">Sort: Priority</option>
        <option value="name">Sort: Name</option>
        <option value="changes">Sort: Changes</option>
      </select>
    </div>
  );
}
