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
});
