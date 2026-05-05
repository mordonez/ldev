import fs from 'node:fs';

import {describe, expect, test} from 'vitest';

import {dashboardHtml} from '../../src/features/dashboard/dashboard-html.js';

const dashboardClientApp = fs.readFileSync('src/features/dashboard/client/app.jsx', 'utf8');
const dashboardClientStyles = fs.readFileSync('src/features/dashboard/client/styles.css', 'utf8');

describe('dashboardHtml', () => {
  test('serves the dashboard shell through the Preact client entrypoint', () => {
    expect(dashboardHtml).toContain('<div id="dashboard-root"></div>');
    expect(dashboardHtml).toContain('<script type="module" src="./app.jsx"></script>');
  });

  test('mounts a Preact dashboard app with the live dashboard APIs', () => {
    expect(dashboardClientApp).toContain("from 'preact'");
    expect(dashboardClientApp).toContain('function App()');
    expect(dashboardClientApp).toContain("render(<App />, document.getElementById('dashboard-root'))");
    expect(dashboardClientApp).toContain("new EventSource('/api/tasks/stream')");
    expect(dashboardClientApp).toContain("fetch('/api/status'");
  });

  test('keeps card sections and dirty worktree context visible', () => {
    expect(dashboardClientApp).toContain('function buildSections(wt)');
    expect(dashboardClientApp).toContain("label: 'Changes'");
    expect(dashboardClientApp).toContain("label: 'Services'");
    expect(dashboardClientApp).toContain("label: 'Commits'");
    expect(dashboardClientApp).toContain('Workspace details');
    expect(dashboardClientApp).toContain('Latest commit');
    expect(dashboardClientApp).toContain('`${wt.changedFiles} pending`');
    expect(dashboardClientStyles).toContain('card-chip-red');
  });

  test('includes guided modals for worktrees, databases, diagnostics, and resource exports', () => {
    expect(dashboardClientApp).toContain('function CreateModal');
    expect(dashboardClientApp).toContain('function SimpleFormModal');
    expect(dashboardClientApp).toContain('title="DB tools"');
    expect(dashboardClientApp).toContain('title="Resource export"');
    expect(dashboardClientApp).toContain('/resource/export');
    expect(dashboardClientApp).toContain('/api/doctor');
    expect(dashboardClientApp).toContain('/mcp/setup');
    expect(dashboardClientApp).toContain('/deploy/status');
    expect(dashboardClientApp).toContain('/deploy/cache-update');
  });

  test('does not show duplicate primary actions in running worktree cards', () => {
    expect(dashboardClientApp).toContain("primary[0] !== 'start' && !running");
    expect(dashboardClientApp).toContain('wt.env && !stopped');
  });
});
