import vm from 'node:vm';
import fs from 'node:fs';

import {describe, expect, test} from 'vitest';

import {dashboardHtml} from '../../src/features/dashboard/dashboard-html.js';

const dashboardClientScript = fs.readFileSync('src/features/dashboard/client/legacy-dashboard.js', 'utf8');
const dashboardClientStyles = fs.readFileSync('src/features/dashboard/client/styles.css', 'utf8');

describe('dashboardHtml', () => {
  test('serves the dashboard shell through a dedicated client module', () => {
    expect(dashboardHtml).toContain('<link rel="stylesheet" href="./styles.css">');
    expect(dashboardHtml).toContain('<script type="module" src="./legacy-dashboard.js"></script>');
  });

  test('contains a parseable dashboard client controller', () => {
    expect(() => new vm.Script(dashboardClientScript)).not.toThrow();
  });

  test('uses card section chips and keeps commits visible when worktrees are dirty', () => {
    expect(dashboardClientScript).toContain('cardSections: cardSectionByName');
    expect(dashboardClientScript).toContain('function prioritizeCardSections(sections)');
    expect(dashboardClientScript).toContain('function summarizeServiceHealth(services)');
    expect(dashboardClientScript).toContain('function renderCardSections(name, sections, activeKey)');
    expect(dashboardClientScript).toContain('function buildChangesSection(changedPaths, changedFiles)');
    expect(dashboardClientScript).toContain('data-card-section="');
    expect(dashboardClientStyles).toContain('card-chip-red');
    expect(dashboardClientScript).toContain("String(changedFiles) + ' pending'");
    expect(dashboardClientScript).toContain("label: 'Changes'");
    expect(dashboardClientScript).toContain(
      'var changedPaths = Array.isArray(wt.changedPaths) ? wt.changedPaths.filter(Boolean) : [];',
    );
    expect(dashboardClientScript).toContain("String(serviceSummary.failed) + ' down'");
    expect(dashboardClientScript).toContain("String(serviceSummary.warned) + ' warn'");
    expect(dashboardClientScript).toContain('Workspace details');
    expect(dashboardClientScript).toContain('Latest commit');
    expect(dashboardClientScript).toContain('wt.changedFiles > 0 && commits');
  });

  test('includes a worktree resource export modal with all resource types selected by default', () => {
    expect(dashboardHtml).toContain('Resource export');
    expect(dashboardClientScript).toContain('Bulk export for this environment');
    expect(dashboardHtml).toContain('data-resource-kind checked');
    expect(dashboardClientScript).toContain('/resource/export');
  });

  test('does not show duplicate primary actions in running worktree cards', () => {
    expect(dashboardClientScript).toContain(
      "var startBtn = isRunning || isActionBusy(wt.name, 'start') || primaryAction.key === 'start' ? ''",
    );
    expect(dashboardClientScript).toContain('if (!isRunning) {');
    expect(dashboardClientScript).toContain('if (!isStopped) {');
  });
});
