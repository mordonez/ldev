import {h} from 'preact';
import {useEffect, useRef} from 'preact/hooks';

import {isRunning, isWorktreeStarting, isWorktreeStopping, serviceTone} from '../lib/dashboard-state.js';
import {
  IconBarChart2,
  IconBranch,
  IconCheck,
  IconCopy,
  IconDatabase,
  IconFolder,
  IconKey,
  IconMoreHorizontal,
  IconPackage,
  IconPlay,
  IconRotateCcw,
  IconSearch,
  IconSquare,
  IconTerminal,
  IconTrash2,
} from '../lib/icons.jsx';
import {cx} from '../lib/cx.js';
import {CopyBtn, useCopyState} from './copy-btn.jsx';
import {StatusPill} from './status-pill.jsx';
import {buildWorktreePresentation} from '../lib/worktree-presentation.js';

const ACTION_ICONS = {
  'deploy-cache-update': <IconRotateCcw size={12} />,
  'deploy-status': <IconBarChart2 size={12} />,
  'init-env': <IconPlay size={12} />,
  'oauth-install': <IconKey size={12} />,
  doctor: <IconSearch size={12} />,
  recreate: <IconRotateCcw size={12} />,
  restart: <IconPlay size={12} />,
  restore: <IconRotateCcw size={12} />,
  start: <IconPlay size={12} />,
  stop: <IconSquare size={12} />,
};

function actionIcon(action) {
  if (action.target === 'logs') return <IconTerminal size={12} />;
  if (action.target === 'db') return <IconDatabase size={12} />;
  if (action.target === 'delete') return <IconTrash2 size={12} />;
  if (action.target === 'resource') return <IconPackage size={12} />;
  if (action.action) return ACTION_ICONS[action.action] ?? null;
  return null;
}

export function WorktreeCard({onAction, onCopy, onDelete, onDb, onLogs, onResource, onRestore, onSelect, tasks, wt}) {
  const presentation = buildWorktreePresentation(wt, tasks);
  const running = isRunning(wt);
  const isStarting = isWorktreeStarting(tasks, wt.name);
  const isStopping = isWorktreeStopping(tasks, wt.name);

  const ab = wt.aheadBehind || {};
  const services = wt.env?.services || [];
  const svcUp = services.filter((s) => serviceTone(s) === 'green').length;
  const svcBad = services.filter((s) => serviceTone(s) === 'yellow' || serviceTone(s) === 'red').length;
  const reach = wt.env?.portalReachable;
  const reachCls = !wt.env ? 'r-idle' : running ? (reach === false ? 'r-down' : 'r-up') : 'r-idle';

  const cardStatus = presentation.cardStatus || '';
  const statusMap = {running: 's-running', attention: 's-attention', error: 's-error', main: 's-main'};

  const busy = isStarting || isStopping || presentation.busy(presentation.primary.action);

  return (
    <article
      class={cx('wt', statusMap[cardStatus])}
      onClick={() => onSelect && onSelect(wt.name)}
    >
      {/* Header */}
      <div class="wt-head">
        <div class="wt-id">
          <div class="wt-name">
            <h3 title={wt.name}>{wt.name}</h3>
            {wt.isMain && <span class="tag-main">main</span>}
          </div>
          <div class="wt-branch" title={wt.branch}>
            <IconBranch size={12} />
            {wt.branch || (wt.detached ? 'HEAD detached' : '—')}
          </div>
        </div>
        <StatusPill running={running} hasEnv={!!wt.env} isStarting={isStarting} isStopping={isStopping} />
      </div>

      {/* Stat strip */}
      <div class="wt-stats">
        <div class="stat">
          <span class="stat-k">Changes</span>
          <span class={cx('stat-v', !wt.changedFiles && 'muted')}>
            {wt.changedFiles || '0'}
            <small>{wt.changedFiles ? 'files' : 'clean'}</small>
          </span>
        </div>
        <div class="stat">
          <span class="stat-k">Sync</span>
          <span class={cx('stat-v', !(ab.ahead || ab.behind) && 'muted')}>
            {ab.ahead ? <span class="up">↑{ab.ahead}</span> : null}
            {ab.behind ? <span class="down">↓{ab.behind}</span> : null}
            {!ab.ahead && !ab.behind ? 'even' : null}
          </span>
        </div>
        <div class="stat">
          <span class="stat-k">Services</span>
          <span class={cx('stat-v', !running && 'muted')}>
            {running && services.length
              ? <span class={svcBad ? '' : 'up'} style={svcBad ? {color: 'var(--amber)'} : null}>{svcUp}/{services.length}</span>
              : '—'}
          </span>
        </div>
      </div>

      {/* Portal row */}
      {wt.env?.portalUrl ? (
        <div class="wt-port" onClick={(e) => e.stopPropagation()}>
          <span class={cx('rdot', reachCls)} />
          <a
            href={running && reach !== false ? wt.env.portalUrl : undefined}
            rel="noreferrer"
            target="_blank"
            style={!running || reach === false ? {pointerEvents: 'none', color: 'var(--text-3)'} : null}
          >
            {wt.env.portalUrl.replace('http://', '')}
          </a>
          <CopyBtn text={wt.env.portalUrl} onCopy={onCopy} title="Copy URL" />
        </div>
      ) : (
        <div class="wt-port">
          <span class="rdot r-idle" />
          <span class="noenv">No local runtime</span>
        </div>
      )}

      {/* Path copy */}
      <CopyPathBtn path={wt.path} onCopy={onCopy} />

      {/* Actions */}
      <div class="wt-actions" onClick={(e) => e.stopPropagation()}>
        <PrimaryActionBtn wt={wt} presentation={presentation} running={running} busy={busy} onAction={onAction} />
        {wt.env?.liferay && (
          <button class="act" type="button" onClick={() => onLogs(wt.name)}>
            <IconTerminal size={13} />Logs
          </button>
        )}
        <MoreMenu actions={presentation.advancedActions} wt={wt}
          onAction={onAction} onDb={onDb} onDelete={onDelete} onLogs={onLogs} onResource={onResource} onRestore={onRestore} />
      </div>
    </article>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function PrimaryActionBtn({wt, presentation, running, busy, onAction}) {
  if (running) {
    return (
      <button class="act a-stop" disabled={busy} type="button"
        onClick={() => onAction(wt.name, 'stop', null)}>
        <IconSquare size={12} />Stop
      </button>
    );
  }
  const primary = presentation.actions[0];
  if (!primary) return null;
  const isStart = ['start', 'init-env', 'restart'].includes(primary.action);
  return (
    <button
      class={cx('act', isStart && 'a-start', primary.action === 'init-env' && 'a-init')}
      disabled={primary.disabled || busy}
      type="button"
      onClick={() => onAction(wt.name, primary.action, null)}
    >
      {actionIcon(primary)}{primary.label}
    </button>
  );
}

function CopyPathBtn({path, onCopy}) {
  const [done, handleClick] = useCopyState(path, onCopy);
  return (
    <button class={cx('wt-path', done && 'copied')} title={`Copy path · ${path}`} type="button" onClick={handleClick}>
      <IconFolder size={13} />
      <span class="wt-path-text">{'‎' + path}</span>
      {done ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  );
}

function MoreMenu({actions, wt, onAction, onDb, onDelete, onLogs, onResource, onRestore}) {
  const detailsRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (detailsRef.current?.open && !detailsRef.current.contains(e.target))
        detailsRef.current.open = false;
    };
    const esc = (e) => {
      if (e.key === 'Escape' && detailsRef.current?.open)
        detailsRef.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  if (!actions?.length) return null;

  const dispatch = (e, action) => {
    const menu = e.currentTarget.closest('details');
    if (menu) menu.open = false;
    if (action.target === 'action') onAction(wt.name, action.action, null);
    else if (action.target === 'db') onDb(wt.name);
    else if (action.target === 'resource') onResource(wt.name);
    else if (action.target === 'logs') onLogs(wt.name);
    else if (action.target === 'delete') onDelete(wt.name, wt.branch);
    else if (action.target === 'restore') onRestore(wt.name);
  };

  return (
    <details class="actions-more" ref={detailsRef}>
      <summary class="act a-icon" title="More actions">
        <IconMoreHorizontal size={14} />
      </summary>
      <div class="actions-more-menu">
        {actions.map((action) => (
          <button
            class={cx('act', action.target === 'delete' && 'a-stop')}
            disabled={action.disabled}
            key={`${action.target}-${action.action || action.label}`}
            type="button"
            onClick={(e) => dispatch(e, action)}
          >
            {actionIcon(action)}{action.label}
          </button>
        ))}
      </div>
    </details>
  );
}
