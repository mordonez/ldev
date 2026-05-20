import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {resolveProjectInitInputs} from '../../src/commands/project/project.command.js';

describe('resolveProjectInitInputs', () => {
  test('uses the positional directory as target and project name', () => {
    expect(resolveProjectInitInputs({}, 'dxp2026')).toEqual({
      name: 'dxp2026',
      targetDir: 'dxp2026',
    });
  });

  test('infers the project name from --dir when --name is omitted', () => {
    expect(resolveProjectInitInputs({dir: path.join('projects', 'dxp2026')})).toEqual({
      name: 'dxp2026',
      targetDir: path.join('projects', 'dxp2026'),
    });
  });

  test('uses --name as the target directory when no directory is provided', () => {
    expect(resolveProjectInitInputs({name: 'dxp2026'})).toEqual({
      name: 'dxp2026',
      targetDir: 'dxp2026',
    });
  });

  test('lets --name override the inferred project name', () => {
    expect(resolveProjectInitInputs({name: 'portal-main', dir: 'dxp2026'})).toEqual({
      name: 'portal-main',
      targetDir: 'dxp2026',
    });
  });

  test('requires at least one project destination input', () => {
    expectCliErrorCode(() => resolveProjectInitInputs({}), 'PROJECT_INIT_DESTINATION_REQUIRED');
  });
});

function expectCliErrorCode(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({code});
    return;
  }

  throw new Error(`Expected action to throw ${code}`);
}
