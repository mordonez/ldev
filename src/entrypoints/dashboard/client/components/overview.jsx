import {h} from 'preact';

export function Overview({stats, activeFilter, onFilter}) {
  const total = stats.total;
  const heroActive = activeFilter === 'all';
  return (
    <div class="overview">
      <div class={`kpi kpi-hero is-link${heroActive ? ' is-active' : ''}`} onClick={() => onFilter('all')}>
        <div class="kpi-top">
          <span class="kpi-label">Worktrees</span>
        </div>
        <div class="kpi-row">
          <span class="kpi-num">{total}</span>
          <span class="kpi-sub">{stats.withEnv} with a local env</span>
        </div>
        <div class="kpi-bars">
          <i class="bg-green" style={{flex: stats.running || 0.001}} />
          <i class="bg-amber" style={{flex: stats.attentionOnly || 0.001}} />
          <i class="bg-red" style={{flex: stats.error || 0.001}} />
          <i class="bg-gray" style={{flex: stats.idle || 0.001}} />
        </div>
      </div>
      <KpiTile label="Running" num={stats.running} dot="green" sub="live portals"
        active={activeFilter === 'running'} onClick={() => onFilter(activeFilter === 'running' ? 'all' : 'running')} />
      <KpiTile label="Need attention" num={stats.attention} dot="amber" sub="dirty / behind / unhealthy"
        active={activeFilter === 'attention'} onClick={() => onFilter(activeFilter === 'attention' ? 'all' : 'attention')} />
      <KpiTile label="Uncommitted" num={stats.dirty} dot="gray" sub="worktrees with changes"
        active={activeFilter === 'dirty'} onClick={() => onFilter(activeFilter === 'dirty' ? 'all' : 'dirty')} />
      <KpiTile label="Ports up" num={stats.up} dot="accent" sub="reachable endpoints"
        active={activeFilter === 'up'} onClick={() => onFilter(activeFilter === 'up' ? 'all' : 'up')} />
    </div>
  );
}

function KpiTile({label, num, dot, sub, active, onClick}) {
  return (
    <div class={`kpi is-link${active ? ' is-active' : ''}`} onClick={onClick}>
      <div class="kpi-top">
        <span class="kpi-label">{label}</span>
        <span class={`kpi-dot dot-${dot}`} />
      </div>
      <div class="kpi-row"><span class="kpi-num">{num}</span></div>
      <span class="kpi-sub">{sub}</span>
    </div>
  );
}
