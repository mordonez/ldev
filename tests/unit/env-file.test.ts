import fs from 'node:fs';

import {describe, expect, test} from 'vitest';

import {readEnvFile, upsertEnvFileValues} from '../../src/core/config/env-file.js';
import {createTempRepo} from '../../src/testing/temp-repo.js';

describe('env-file', () => {
  test('reads key value pairs', () => {
    const repoRoot = createTempRepo();
    const envFile = `${repoRoot}/docker/.env`;
    fs.writeFileSync(envFile, 'A=1\nB=two\n');

    expect(readEnvFile(envFile)).toEqual({A: '1', B: 'two'});
  });

  test('upserts values without duplicating keys', () => {
    const updated = upsertEnvFileValues('A=1\nB=2\n', {B: '3', C: '4'});
    expect(updated).toBe('A=1\nB=3\nC=4');
  });
});
