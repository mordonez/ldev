import {h} from 'preact';

import {classNames, serviceName, serviceStatusLabel, serviceTone} from '../lib/dashboard-state.js';

export function buildSections(wt) {
  const sections = [];
  const changedPaths = Array.isArray(wt.changedPaths) ? wt.changedPaths.filter(Boolean) : [];
  if (changedPaths.length) {
    sections.push(buildChangesSection(changedPaths, wt.changedFiles));
  }
  if (wt.env?.services?.length) {
    sections.push(buildServicesSection(wt.env.services));
  }
  if (wt.commits?.length) {
    sections.push(buildCommitsSection(wt.commits, wt.changedFiles));
  }
  return sections;
}

function buildChangesSection(changedPaths, changedFiles) {
  return {
    key: 'changes',
    label: 'Changes',
    count: String(changedFiles),
    tone: 'yellow',
    content: (
      <div class="detail-section">
        <div class="changed-files">
          {changedPaths.slice(0, 8).map((changedPath) => (
            <div class="changed-file" key={changedPath}>
              <span class="changed-file-path">{changedPath}</span>
            </div>
          ))}
          {changedPaths.length > 8 ? <div class="changed-file-more">+{changedPaths.length - 8} more files</div> : null}
        </div>
      </div>
    ),
  };
}

function buildServicesSection(services) {
  const failed = services.filter((service) => serviceTone(service) === 'red').length;
  const warned = services.filter((service) => serviceTone(service) === 'yellow').length;
  const healthy = services.filter((service) => serviceTone(service) === 'green').length;
  const count = failed ? `${failed} down` : warned ? `${warned} warn` : `${healthy} up`;

  return {
    key: 'services',
    label: 'Services',
    count,
    tone: failed ? 'red' : warned ? 'yellow' : 'green',
    content: (
      <div class="detail-section">
        <div class="services">
          {services.map((service) => (
            <span class="svc" key={serviceName(service)} title={serviceStatusLabel(service)}>
              <span class={classNames('dot', `dot-${serviceTone(service)}`)} />
              {serviceName(service)}: {serviceStatusLabel(service)}
            </span>
          ))}
        </div>
      </div>
    ),
  };
}

function buildCommitsSection(commits, changedFiles) {
  return {
    key: 'commits',
    label: 'Commits',
    count: changedFiles > 0 ? `${changedFiles} pending` : String(commits.length),
    tone: changedFiles > 0 ? 'yellow' : 'blue',
    content: (
      <div class="commits">
        <div class="commits-header">
          <span class="commits-label">Commits</span>
          {changedFiles > 0 ? <span class="changed">{changedFiles} changed</span> : null}
        </div>
        {commits.map((commit) => (
          <div class="commit" key={`${commit.hash}-${commit.subject}`}>
            <span class="chash">{commit.hash}</span>
            <span class="csubject" title={commit.subject}>
              {commit.subject}
            </span>
            <span class="cdate">{commit.date}</span>
          </div>
        ))}
      </div>
    ),
  };
}
