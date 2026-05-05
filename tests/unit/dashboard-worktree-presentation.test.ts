/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import {describe, expect, test} from 'vitest';

// @ts-expect-error Dashboard client modules are plain browser JavaScript.
import {buildWorktreePresentation} from '../../src/features/dashboard/client/lib/worktree-presentation.js';

describe('buildWorktreePresentation', () => {
  test('derives badges, primary action, and busy state for a stopped dirty worktree', () => {
    const presentation = buildWorktreePresentation(
      {
        name: 'demo',
        branch: 'feature/demo',
        changedFiles: 2,
        changedPaths: ['src/demo.ts'],
        commits: [],
        env: {},
        path: '/repo/demo',
      },
      [{kind: 'worktree-start', status: 'running', worktreeName: 'demo'}],
      undefined,
    );

    expect(presentation.badges).toEqual([
      {label: '2 changed', tone: 'yellow'},
      {label: 'stopped', tone: 'gray'},
      {label: 'attention', tone: 'red'},
    ]);
    expect(presentation.primary).toEqual(['start', 'btn-start', 'Start']);
    expect(presentation.busy('start')).toBe(true);
    expect(presentation.sections.map((section: {key: string}) => section.key)).toEqual(['changes']);
    expect(presentation.selected?.key).toBe('changes');
  });

  test('flags running worktrees that need attention', () => {
    const presentation = buildWorktreePresentation(
      {
        name: 'demo',
        changedFiles: 0,
        commits: [],
        env: {liferay: {state: 'running'}, portalReachable: false, services: [{service: 'liferay', state: 'stopped'}]},
        path: '/repo/demo',
      },
      [],
      'services',
    );

    expect(presentation.badges).toEqual([
      {label: 'running', tone: 'green'},
      {label: 'attention', tone: 'red'},
    ]);
    expect(presentation.primary).toEqual(['restart', 'btn-start', 'Restart']);
    expect(presentation.selected?.key).toBe('services');
  });
});
