import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {detectRepoPaths} from '../../src/core/config/repo-paths.js';
import {createTempRepo} from '../../src/testing/temp-repo.js';

describe('repo-paths', () => {
  test('detects repo root from nested path', () => {
    const repoRoot = createTempRepo();
    const nested = path.join(repoRoot, 'liferay', 'modules');
    fs.mkdirSync(nested, {recursive: true});

    const detected = detectRepoPaths(nested);

    expect(detected.repoRoot).toBe(repoRoot);
    expect(detected.dockerDir).toBe(path.join(repoRoot, 'docker'));
    expect(detected.liferayDir).toBe(path.join(repoRoot, 'liferay'));
  });
});
