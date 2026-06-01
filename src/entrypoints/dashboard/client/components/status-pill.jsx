import {h} from 'preact';

export function StatusPill({running, hasEnv, isStarting, isStopping}) {
  if (isStarting) return <span class="pill p-starting"><span class="pdot" />Starting</span>;
  if (isStopping) return <span class="pill p-starting"><span class="pdot" />Stopping</span>;
  if (!hasEnv) return <span class="pill p-noenv"><span class="pdot" />No env</span>;
  if (running) return <span class="pill p-running"><span class="pdot" />Running</span>;
  return <span class="pill p-stopped"><span class="pdot" />Stopped</span>;
}
