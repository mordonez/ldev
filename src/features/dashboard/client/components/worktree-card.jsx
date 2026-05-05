import {Fragment, h} from 'preact';

import {classNames} from '../lib/dashboard-state.js';
import {buildWorktreePresentation} from '../lib/worktree-presentation.js';

export function WorktreeCard({activeSection, onAction, onCopy, onDelete, onDb, onLogs, onResource, onSection, tasks, wt}) {
  const presentation = buildWorktreePresentation(wt, tasks, activeSection);

  return (
    <div class="card">
      <CardHeader badges={presentation.badges} wt={wt} />
      <PathRow onCopy={onCopy} path={wt.path} />
      <PortalRow env={wt.env} />
      <LatestCommit commit={wt.commits?.[0]} />
      <CardActions busy={presentation.busy} onAction={onAction} onDb={onDb} onDelete={onDelete} onLogs={onLogs} onResource={onResource} primary={presentation.primary} running={presentation.running} stopped={presentation.stopped} wt={wt} />
      <CardSections activeSection={activeSection} onSection={onSection} sections={presentation.sections} selected={presentation.selected} wt={wt} />
    </div>
  );
}

function CardHeader({badges, wt}) {
  return (
    <div class="card-header">
      <div class="card-meta">
        <div class="card-title">
          {wt.name}
          {wt.isMain ? <span class="card-main-label">(main)</span> : null}
        </div>
        <div class="card-branch">{wt.branch || (wt.detached ? 'HEAD detached' : '-')}</div>
      </div>
      <div class="card-badges">
        <div class="card-badge-row">
          {badges.map((badge) => (
            <span class={classNames('badge', `badge-${badge.tone}`)} key={`${badge.tone}-${badge.label}`}>
              {badge.label}
            </span>
          ))}
        </div>
        {wt.aheadBehind ? (
          <div class="ahead-behind">
            {wt.aheadBehind.ahead ? <span class="ahead">up {wt.aheadBehind.ahead}</span> : null}
            {wt.aheadBehind.behind ? <span class="behind">down {wt.aheadBehind.behind}</span> : null}
            <span>{wt.aheadBehind.base}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PathRow({onCopy, path}) {
  return (
    <div class="path-row">
      <span class="path-text" title={path}>
        {path}
      </span>
      <button class="btn-copy" type="button" onClick={(event) => onCopy(path, event.currentTarget)}>
        copy
      </button>
    </div>
  );
}

function PortalRow({env}) {
  if (!env?.portalUrl) return null;
  return (
    <div class="portal-row">
      <span class={classNames('reach-dot', `dot-${env.portalReachable === false ? 'red' : env.portalReachable === true ? 'green' : 'gray'}`)} />
      <a href={env.portalUrl} rel="noreferrer" target="_blank">
        {env.portalUrl}
      </a>
    </div>
  );
}

function LatestCommit({commit}) {
  if (!commit) return null;
  return (
    <div class="card-preview-row">
      <span class="card-preview-label">Latest commit</span>
      <div class="commit-preview">
        <span class="chash">{commit.hash}</span>
        <span class="commit-preview-subject" title={commit.subject}>
          {commit.subject}
        </span>
        <span class="card-preview-meta">{commit.date}</span>
      </div>
    </div>
  );
}

function CardActions({busy, onAction, onDb, onDelete, onLogs, onResource, primary, running, stopped, wt}) {
  return (
    <div class="actions">
      <button class={classNames('action', primary[1])} type="button" disabled={busy(primary[0])} onClick={(event) => onAction(wt.name, primary[0], event.currentTarget)}>
        {busy(primary[0]) ? '...' : primary[2]}
      </button>
      {primary[0] !== 'start' && !running ? (
        <button class="action btn-start" type="button" disabled={busy('start')} onClick={(event) => onAction(wt.name, 'start', event.currentTarget)}>
          {busy('start') ? '...' : 'Start'}
        </button>
      ) : null}
      {wt.env && !stopped ? (
        <button class="action btn-stop" type="button" disabled={busy('stop')} onClick={(event) => onAction(wt.name, 'stop', event.currentTarget)}>
          {busy('stop') ? '...' : 'Stop'}
        </button>
      ) : null}
      {wt.env?.liferay ? (
        <button class="action btn-logs" type="button" onClick={() => onLogs(wt.name)}>
          Logs
        </button>
      ) : null}
      <button class="action btn-ghost" type="button" onClick={() => onDb(wt.name)}>
        DB
      </button>
      <button class="action btn-ghost" type="button" onClick={() => onResource(wt.name)}>
        Resource export
      </button>
      <button class="action btn-ghost" type="button" disabled={busy('mcp-setup')} onClick={(event) => onAction(wt.name, 'mcp-setup', event.currentTarget)}>
        {busy('mcp-setup') ? '...' : 'MCP setup'}
      </button>
      {wt.env ? (
        <Fragment>
          <button class="action btn-ghost" type="button" disabled={busy('deploy-status')} onClick={(event) => onAction(wt.name, 'deploy-status', event.currentTarget)}>
            Deploy status
          </button>
          <button class="action btn-ghost" type="button" disabled={busy('deploy-cache-update')} onClick={(event) => onAction(wt.name, 'deploy-cache-update', event.currentTarget)}>
            {busy('deploy-cache-update') ? '...' : 'Cache update'}
          </button>
          <button class="action btn-ghost" type="button" disabled={busy('recreate')} onClick={(event) => onAction(wt.name, 'recreate', event.currentTarget)}>
            {busy('recreate') ? '...' : 'Recreate'}
          </button>
        </Fragment>
      ) : null}
      <div class="actions-spacer" />
      {!wt.isMain ? (
        <button class="btn-delete" type="button" onClick={() => onDelete(wt.name)}>
          Delete
        </button>
      ) : null}
    </div>
  );
}

function CardSections({onSection, sections, selected, wt}) {
  if (!selected) return null;
  return (
    <div class="card-panel-stack">
      <div class="card-panel">
        <div class="card-panel-header">
          <div class="card-panel-title">Workspace details</div>
          <div class="card-chip-row">
            {sections.map((section) => (
              <button class={classNames('card-chip', section.tone && `card-chip-${section.tone}`, selected.key === section.key && 'active')} key={section.key} type="button" onClick={() => onSection(wt.name, section.key)}>
                {section.label}
                {section.count ? <span class="card-chip-count"> - {section.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
        {selected.content}
      </div>
    </div>
  );
}
