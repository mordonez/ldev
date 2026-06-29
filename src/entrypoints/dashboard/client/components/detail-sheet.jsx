import {Fragment, h} from 'preact';
import {useEffect} from 'preact/hooks';

import {attentionReasons, isRunning, isWorktreeStarting, isWorktreeStopping, serviceTone, serviceName, serviceStatusLabel} from '../lib/dashboard-state.js';
import {
  IconAlertTriangle,
  IconBarChart2,
  IconCheck,
  IconBranch,
  IconDatabase,
  IconFile,
  IconFolder,
  IconGitCommit,
  IconKey,
  IconPackage,
  IconPlay,
  IconRotateCcw,
  IconSquare,
  IconTerminal,
  IconTrash2,
  IconX,
} from '../lib/icons.jsx';
import {cx} from '../lib/cx.js';
import {CopyBtn} from './copy-btn.jsx';
import {StatusPill} from './status-pill.jsx';

export function DetailSheet({wt, tasks, onClose, onAction, onDb, onLogs, onResource, onDelete, onRestore, onCopy, copiedPath}) {
  const running = isRunning(wt);
  const reasons = attentionReasons(wt);
  const ab = wt.aheadBehind || {};
  const services = wt.env?.services || [];
  const changedPaths = Array.isArray(wt.changedPaths) ? wt.changedPaths.filter(Boolean) : [];

  const isStarting = isWorktreeStarting(tasks, wt.name);
  const isStopping = isWorktreeStopping(tasks, wt.name);
  const busy = isStarting || isStopping;

  const worktreeTask = tasks?.find(
    (t) => (t.status === 'running' || t.status === 'canceling') && t.worktreeName === wt.name,
  );
  const busyLabel = worktreeTask?.status === 'canceling' ? 'Canceling…' : '…';

  const reach = wt.env?.portalReachable;
  const reachCls = !wt.env ? 'r-idle' : running ? (reach === false ? 'r-down' : 'r-up') : 'r-idle';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div class="sheet-scrim" onClick={onClose} />
      <aside class="sheet" role="dialog" aria-modal="true">

        {/* ── Header ── */}
        <div class="sheet-head">
          <div class="sheet-top">
            <div class="sheet-title">
              <h2 title={wt.name}>{wt.name}</h2>
              {wt.isMain && <span class="tag-main">main</span>}
              <StatusPill running={running} hasEnv={!!wt.env} isStarting={isStarting} isStopping={isStopping} />
            </div>
            <button class="sheet-close" type="button" aria-label="Cerrar" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>
          <div class="sheet-branch">
            <IconBranch size={13} />
            <span>{wt.branch || (wt.detached ? 'HEAD detached' : '—')}</span>
            {(ab.ahead || ab.behind) && <span class="sheet-branch-sep">·</span>}
            {ab.ahead ? <span class="sheet-ab-ahead">↑{ab.ahead}</span> : null}
            {ab.behind ? <span class="sheet-ab-behind">↓{ab.behind}</span> : null}
            {ab.base && <span class="sheet-ab-base">{ab.base}</span>}
          </div>
          <div class="sheet-actions">
            {running ? (
              <button class="act a-stop" disabled={busy} type="button"
                style={{flex: '0 0 auto', padding: '8px 16px'}}
                onClick={() => onAction(wt.name, 'stop', null)}>
                <IconSquare size={13} />{busy ? busyLabel : 'Stop env'}
              </button>
            ) : wt.env ? (
              <button class="act a-start" disabled={busy} type="button"
                style={{flex: '0 0 auto', padding: '8px 16px'}}
                onClick={() => onAction(wt.name, isStarting ? 'stop' : 'start', null)}>
                <IconPlay size={13} />{busy ? busyLabel : 'Start env'}
              </button>
            ) : (
              <button class="act a-init" disabled={busy} type="button"
                style={{flex: '0 0 auto', padding: '8px 16px'}}
                onClick={() => onAction(wt.name, 'init-env', null)}>
                <IconPlay size={13} />{busy ? busyLabel : 'Init env'}
              </button>
            )}
            {wt.env?.liferay && (
              <button class="btn" type="button" onClick={() => onLogs(wt.name)}>
                <IconTerminal size={14} />Logs
              </button>
            )}
            <button class="btn" type="button" onClick={() => onDb(wt.name)}>
              <IconDatabase size={14} />DB sync
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div class="sheet-body">

          {/* Attention banner */}
          {reasons.length ? (
            <div class="det-banner det-banner-warn">
              <div class="det-banner-label">
                <IconAlertTriangle size={13} />Needs attention
              </div>
              <div class="det-banner-text">{reasons.join(' · ')}</div>
            </div>
          ) : (
            <div class="det-banner det-banner-ok">
              <div class="det-banner-label">
                <IconCheck size={13} />All clear
              </div>
              <div class="det-banner-text">Clean tree, in sync, runtime healthy.</div>
            </div>
          )}

          {/* Info grid */}
          <div class="det-grid">
            <div class="det-cell">
              <span class="det-k">Portal</span>
              <span class="det-v">
                <span class={cx('rdot', reachCls)} />
                {wt.env?.portalUrl ? (
                  <a href={running ? wt.env.portalUrl : undefined} rel="noreferrer" target="_blank"
                    style={{color: running ? 'var(--accent)' : 'var(--text-3)', textDecoration: 'none'}}>
                    {wt.env.portalUrl.replace('http://', '')}
                  </a>
                ) : <span style={{color: 'var(--text-3)'}}>none</span>}
              </span>
            </div>
            <div class="det-cell">
              <span class="det-k">Glowroot</span>
              <span class="det-v">
                {wt.env?.glowrootUrl ? (
                  <a href={running ? wt.env.glowrootUrl : undefined} rel="noreferrer" target="_blank"
                    style={{color: running ? 'var(--accent)' : 'var(--text-3)', textDecoration: 'none'}}>
                    {wt.env.glowrootUrl.replace('http://', '')}
                  </a>
                ) : <span style={{color: 'var(--text-3)'}}>none</span>}
              </span>
            </div>
            <div class="det-cell">
              <span class="det-k">Changes</span>
              <span class="det-v" style={{color: wt.changedFiles ? 'var(--amber)' : 'var(--text-3)'}}>
                {wt.changedFiles ? `${wt.changedFiles} files` : 'clean'}
              </span>
            </div>
            <div class="det-cell det-cell-full">
              <span class="det-k">Path</span>
              <span class="det-v" style={{fontSize: '12px', gap: '8px'}}>
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1}}>{wt.path}</span>
                <CopyBtn text={wt.path} onCopy={onCopy} copied={copiedPath === wt.path}
                  style={{marginLeft: 'auto', flexShrink: 0}} />
              </span>
            </div>
          </div>

          {/* Changed files */}
          {changedPaths.length ? (
            <Section icon={<IconFile size={14} />} label="Changed files" count={wt.changedFiles} countTone="warn">
              <div class="files" style={{maxHeight: '200px', overflowY: 'auto'}}>
                {changedPaths.slice(0, 12).map((f, i) => {
                  const isObj = typeof f === 'object' && f !== null && f.s;
                  const tagMap = {M: 'm', A: 'a', D: 'd'};
                  return (
                    <div class="file-row" key={i}>
                      {isObj ? <span class={cx('ftag', tagMap[f.s] || 'm')}>{f.s}</span> : null}
                      <span class="fpath" title={isObj ? f.path : f}>{'‎' + (isObj ? f.path : f)}</span>
                    </div>
                  );
                })}
                {changedPaths.length > 12 ? (
                  <div class="file-row" style={{color: 'var(--text-3)', justifyContent: 'center'}}>
                    +{changedPaths.length - 12} more
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}

          {/* Services */}
          {wt.env && services.length ? (
            <Section icon={<IconTerminal size={14} />} label="Services"
              count={running
                ? `${services.filter((s) => serviceTone(s) === 'green').length}/${services.length} up`
                : 'stopped'}
              countTone={running && services.some((s) => serviceTone(s) !== 'green') ? 'warn' : null}>
              <div class="svc-list">
                {services.map((s, i) => {
                  const tone = running ? serviceTone(s) : 'gray';
                  const dotColor = {green: 'var(--green)', yellow: 'var(--amber)', red: 'var(--red)', gray: 'var(--text-3)'}[tone] || 'var(--text-3)';
                  return (
                    <div class="svc" key={i}>
                      <span class="sdot" style={{background: dotColor}} />
                      <span class="svc-name">{serviceName(s)}</span>
                      <span class={cx('svc-state', tone === 'green' ? 'ok' : tone === 'yellow' ? 'warn' : tone === 'red' ? 'down' : 'gray')}>
                        {running ? serviceStatusLabel(s) : 'exited'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {/* Recent commits */}
          {wt.commits?.length ? (
            <Section icon={<IconGitCommit size={14} />} label="Recent commits" count={wt.commits.length}>
              <div class="commits">
                {wt.commits.map((c, i) => (
                  <div class="commit" key={i}>
                    <span class="chash">{c.hash}</span>
                    <span class="csubject" title={c.subject}>{c.subject}</span>
                    <span class="cdate">{c.date}</span>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Operations */}
          <Section label="Operations">
            <div class="sheet-ops">
              <button class="btn" type="button" onClick={() => onResource(wt.name)}>
                <IconPackage size={14} />Resource export
              </button>
              <button class="btn" type="button" onClick={() => onAction(wt.name, 'oauth-install', null)}>
                <IconKey size={14} />OAuth install
              </button>
              <button class="btn" type="button" onClick={() => onAction(wt.name, 'deploy-status', null)}>
                <IconBarChart2 size={14} />Deploy status
              </button>
              {wt.env && (
                <button class="btn" type="button" onClick={() => onAction(wt.name, 'recreate', null)}>
                  <IconRotateCcw size={14} />Recreate
                </button>
              )}
              {wt.env && (
                <button class="btn" type="button"
                  style={{color: 'var(--red)'}}
                  onClick={() => { onClose(); onRestore(wt.name); }}>
                  <IconRotateCcw size={14} />Restore
                </button>
              )}
              {!wt.isMain && (
                <button class="btn" type="button"
                  style={{color: 'var(--red)', gridColumn: '1/-1'}}
                  onClick={() => { onClose(); onDelete(wt.name, wt.branch); }}>
                  <IconTrash2 size={14} />Delete worktree
                </button>
              )}
            </div>
          </Section>

        </div>
      </aside>
    </>
  );
}

function Section({icon, label, count, countTone, children}) {
  return (
    <div class="det-section">
      <div class="det-section-head">
        <div class="det-section-title">
          {icon}{label}
          {count != null && (
            <span class={cx('det-section-cnt', countTone === 'warn' && 'warn')}>{count}</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
