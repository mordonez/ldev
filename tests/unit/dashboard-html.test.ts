import vm from 'node:vm';

import {describe, expect, test} from 'vitest';

import {dashboardHtml} from '../../src/features/dashboard/dashboard-html.js';

function extractScript(html: string): string {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) {
    throw new Error('Dashboard script block not found');
  }

  return match[1];
}

describe('dashboardHtml', () => {
  test('contains a parseable embedded dashboard script', () => {
    expect(() => new vm.Script(extractScript(dashboardHtml))).not.toThrow();
  });

  test('uses card section chips and keeps commits visible when worktrees are dirty', () => {
    expect(dashboardHtml).toContain('cardSections: cardSectionByName');
    expect(dashboardHtml).toContain('function prioritizeCardSections(sections)');
    expect(dashboardHtml).toContain('function summarizeServiceHealth(services)');
    expect(dashboardHtml).toContain('function renderCardSections(name, sections, activeKey)');
    expect(dashboardHtml).toContain('function buildChangesSection(changedPaths, changedFiles)');
    expect(dashboardHtml).toContain('data-card-section="');
    expect(dashboardHtml).toContain('card-chip-red');
    expect(dashboardHtml).toContain("String(changedFiles) + ' pending'");
    expect(dashboardHtml).toContain("label: 'Changes'");
    expect(dashboardHtml).toContain(
      'var changedPaths = Array.isArray(wt.changedPaths) ? wt.changedPaths.filter(Boolean) : [];',
    );
    expect(dashboardHtml).toContain("String(serviceSummary.failed) + ' down'");
    expect(dashboardHtml).toContain("String(serviceSummary.warned) + ' warn'");
    expect(dashboardHtml).toContain('Workspace details');
    expect(dashboardHtml).toContain('Latest commit');
    expect(dashboardHtml).toContain('wt.changedFiles > 0 && commits');
  });

  test('includes a worktree resource export modal with all resource types selected by default', () => {
    expect(dashboardHtml).toContain('Resource export');
    expect(dashboardHtml).toContain('Bulk export for this environment');
    expect(dashboardHtml).toContain('data-resource-kind checked');
    expect(dashboardHtml).toContain('/resource/export');
  });

  test('does not show duplicate primary actions in running worktree cards', () => {
    expect(dashboardHtml).toContain(
      "var startBtn = isRunning || isActionBusy(wt.name, 'start') || primaryAction.key === 'start' ? ''",
    );
    expect(dashboardHtml).toContain('if (!isRunning) {');
    expect(dashboardHtml).toContain('if (!isStopped) {');
  });
});
