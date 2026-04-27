import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {groupChangesByModule} from '../../src/features/deploy/deploy-watch.js';

describe('deploy-watch', () => {
  test('groups module and theme changes by deployable unit', () => {
    const liferayDir = '/repo/liferay';
    const grouped = groupChangesByModule(
      liferayDir,
      [
        path.join(liferayDir, 'modules', 'foo', 'src', 'main', 'Foo.java'),
        path.join(liferayDir, 'themes', 'ub-theme', 'src', 'css', 'main.scss'),
      ],
      null,
    );

    expect(grouped.get('foo')).toHaveLength(1);
    expect(grouped.get('ub-theme')).toHaveLength(1);
  });

  test('groups client-extension changes by deployable unit', () => {
    const liferayDir = '/repo/liferay';
    const grouped = groupChangesByModule(
      liferayDir,
      [
        path.join(liferayDir, 'client-extensions', 'my-ext', 'client-extension.yaml'),
        path.join(liferayDir, 'client-extensions', 'my-ext', 'src', 'index.js'),
      ],
      null,
    );

    expect(grouped.get('my-ext')).toHaveLength(2);
  });

  test('ignores changes outside known namespaces', () => {
    const liferayDir = '/repo/liferay';
    const grouped = groupChangesByModule(
      liferayDir,
      [path.join(liferayDir, 'configs', 'dockerenv', 'portal-ext.properties')],
      null,
    );

    expect(grouped.size).toBe(0);
  });
});
