import {Fragment, h} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

import {classNames} from '../lib/dashboard-state.js';
import {
  IconBarChart2,
  IconCheck,
  IconCopy,
  IconDatabase,
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
import {buildWorktreePresentation} from '../lib/worktree-presentation.js';

const ACTION_ICON_MAP = {
  'deploy-cache-update': <IconRotateCcw size={12} />,
  'deploy-status': <IconBarChart2 size={12} />,
  'init-env': <IconPlay size={12} />,
  'oauth-install': <IconKey size={12} />,
  doctor: <IconSearch size={12} />,
  recreate: <IconRotateCcw size={12} />,
  restart: <IconPlay size={12} />,
  start: <IconPlay size={12} />,
  stop: <IconSquare size={12} />,
};

function getActionIcon(action) {
  if (action.target === 'logs') return <IconTerminal size={12} />;
  if (action.target === 'db') return <IconDatabase size={12} />;
  if (action.target === 'delete') return <IconTrash2 size={12} />;
  if (action.target === 'resource') return <IconPackage size={12} />;
  if (action.action) return ACTION_ICON_MAP[action.action] ?? null;
  return null;
}

export function WorktreeCard({activeSection, onAction, onCopy, onDelete, onDb, onLogs, onResource, onSection, tasks, wt}) {
  const presentation = buildWorktreePresentation(wt, tasks, activeSection);

  return (
    <div class={classNames('card', presentation.cardStatus && `card--${presentation.cardStatus}`)}>
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
            <span class={classNames('badge', `badge-${badge.tone}`)} key={`${badge.tone}-${badge.label}`} title={badge.title}>
              {badge.label}
            </span>
          ))}
        </div>
        {wt.aheadBehind ? (
          <div class="ahead-behind">
            {wt.aheadBehind.ahead ? <span class="ahead">↑{wt.aheadBehind.ahead}</span> : null}
            {wt.aheadBehind.behind ? <span class="behind">↓{wt.aheadBehind.behind}</span> : null}
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
      <CopyButton onCopy={onCopy} path={path} />
    </div>
  );
}

function CopyButton({onCopy, path}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  const handleClick = () => {
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      onCopy(path);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  return (
    <button
      class={classNames('btn-copy', copied && 'copied')}
      title={copied ? 'Copied!' : 'Copy path'}
      type="button"
      onClick={handleClick}
    >
      {copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
    </button>
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
        <ActionsMore actions={advancedActions} onAction={onAction} onDb={onDb} onDelete={onDelete} onLogs={onLogs} onResource={onResource} wt={wt} />
      ) : null}
    </div>
  );
}

function ActionsMore({actions, onAction, onDb, onDelete, onLogs, onResource, wt}) {
  const detailsRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      const details = detailsRef.current;
      if (!details?.open || details.contains(event.target)) return;
      details.open = false;
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    };

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <details class="actions-more" ref={detailsRef}>
      <summary>
        <IconMoreHorizontal size={12} />
        More
      </summary>
      <div class="actions-more-menu">
        {actions.map((action) => (
          <ActionButton action={action} key={`${action.target}-${action.action || action.label}`} onAction={onAction} onDb={onDb} onDelete={onDelete} onLogs={onLogs} onResource={onResource} wt={wt} />
        ))}
      </div>
    </details>
  );
}

function ActionButton({action, onAction, onDb, onDelete, onLogs, onResource, wt}) {
  const icon = getActionIcon(action);
  return (
    <button
      class={classNames(action.target === 'delete' ? null : 'action', action.className)}
      disabled={action.disabled}
      type="button"
      onClick={(event) => {
        event.currentTarget.closest('details')?.removeAttribute('open');
        if (action.target === 'action') onAction(wt.name, action.action, event.currentTarget);
        if (action.target === 'db') onDb(wt.name);
        if (action.target === 'resource') onResource(wt.name);
        if (action.target === 'logs') onLogs(wt.name);
        if (action.target === 'delete') onDelete(wt.name, wt.branch);
      }}
    >
      {icon}
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
