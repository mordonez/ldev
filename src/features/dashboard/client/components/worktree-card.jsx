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
      <CardActions actions={presentation.actions} advancedActions={presentation.advancedActions} onAction={onAction} onDb={onDb} onDelete={onDelete} onLogs={onLogs} onResource={onResource} wt={wt} />
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

function CardActions({actions, advancedActions, onAction, onDb, onDelete, onLogs, onResource, wt}) {
  return (
    <div class="actions">
      {actions.map((action) => (
        <Fragment key={`${action.target}-${action.action || action.label}`}>
          <ActionButton action={action} onAction={onAction} onDb={onDb} onDelete={onDelete} onLogs={onLogs} onResource={onResource} wt={wt} />
        </Fragment>
      ))}
      {advancedActions?.length ? (
        <details class="actions-more">
          <summary>More</summary>
          <div class="actions-more-menu">
            {advancedActions.map((action) => (
              <ActionButton action={action} key={`${action.target}-${action.action || action.label}`} onAction={onAction} onDb={onDb} onDelete={onDelete} onLogs={onLogs} onResource={onResource} wt={wt} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ActionButton({action, onAction, onDb, onDelete, onLogs, onResource, wt}) {
  return (
    <button
      class={classNames(action.target === 'delete' ? null : 'action', action.className)}
      disabled={action.disabled}
      type="button"
      onClick={(event) => {
        if (action.target === 'action') onAction(wt.name, action.action, event.currentTarget);
        if (action.target === 'db') onDb(wt.name);
        if (action.target === 'resource') onResource(wt.name);
        if (action.target === 'logs') onLogs(wt.name);
        if (action.target === 'delete') onDelete(wt.name);
      }}
    >
      {action.label}
    </button>
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
