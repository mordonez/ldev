import fs from 'node:fs';

import {describe, expect, test} from 'vitest';

import {dashboardHtml} from '../../src/features/dashboard/dashboard-html.js';

const dashboardClientFiles = [
  'src/features/dashboard/client/app.jsx',
  'src/features/dashboard/client/components/activity.jsx',
  'src/features/dashboard/client/components/create-modal.jsx',
  'src/features/dashboard/client/components/header.jsx',
  'src/features/dashboard/client/components/maintenance.jsx',
  'src/features/dashboard/client/components/modal.jsx',
  'src/features/dashboard/client/components/simple-form-modal.jsx',
  'src/features/dashboard/client/components/toolbar.jsx',
  'src/features/dashboard/client/components/worktree-card.jsx',
  'src/features/dashboard/client/components/worktree-sections.jsx',
  'src/features/dashboard/client/lib/dashboard-state.js',
  'src/features/dashboard/client/lib/preferences.js',
  'src/features/dashboard/client/lib/tasks.js',
];
const dashboardClientSource = dashboardClientFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const dashboardClientStyles = fs.readFileSync('src/features/dashboard/client/styles.css', 'utf8');

describe('dashboardHtml', () => {
  test('serves the dashboard shell through the Preact client entrypoint', () => {
    expect(dashboardHtml).toContain('<div id="dashboard-root"></div>');
    expect(dashboardHtml).toContain('<script type="module" src="./app.jsx"></script>');
  });

  test('mounts a Preact dashboard app with the live dashboard APIs', () => {
    expect(dashboardClientSource).toContain("from 'preact'");
    expect(dashboardClientSource).toContain('function App()');
    expect(dashboardClientSource).toContain("render(<App />, document.getElementById('dashboard-root'))");
    expect(dashboardClientSource).toContain("new EventSource('/api/tasks/stream')");
    expect(dashboardClientSource).toContain("fetch('/api/status'");
  });

  test('keeps card sections and service state visible', () => {
    expect(dashboardClientSource).toContain('function buildSections(wt)');
    expect(dashboardClientSource).toContain("label: 'Changes'");
    expect(dashboardClientSource).toContain("label: 'Services'");
    expect(dashboardClientSource).toContain("label: 'Commits'");
    expect(dashboardClientSource).toContain('Workspace details');
    expect(dashboardClientSource).toContain('Latest commit');
    expect(dashboardClientSource).toContain('`${changedFiles} pending`');
    expect(dashboardClientSource).toContain('service.service || service.name');
    expect(dashboardClientSource).toContain('serviceStatusLabel(service)');
    expect(dashboardClientStyles).toContain('card-chip-red');
  });

  test('includes guided modals for worktrees, databases, diagnostics, and resource exports', () => {
    expect(dashboardClientSource).toContain('function CreateModal');
    expect(dashboardClientSource).toContain('function SimpleFormModal');
    expect(dashboardClientSource).toContain('title="DB tools"');
    expect(dashboardClientSource).toContain('title="Resource export"');
    expect(dashboardClientSource).toContain('/resource/export');
    expect(dashboardClientSource).toContain('/api/doctor');
    expect(dashboardClientSource).toContain('/mcp/setup');
    expect(dashboardClientSource).toContain('/deploy/status');
    expect(dashboardClientSource).toContain('/deploy/cache-update');
  });

  test('does not show duplicate primary actions in running worktree cards', () => {
    expect(dashboardClientSource).toContain("primary[0] !== 'start' && !running");
    expect(dashboardClientSource).toContain('wt.env && !stopped');
  });
});
