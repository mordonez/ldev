import path from 'node:path';
import {readFileSync} from 'node:fs';

import {describe, expect, test} from 'vitest';

describe('package exports integration', () => {
  test('package root does not expose internal command-group internals', () => {
    const dts = readFileSync(path.join(process.cwd(), 'dist', 'index.d.ts'), 'utf8');

    expect(dts).not.toContain('LdevPlugin');
    expect(dts).not.toContain('BUILTIN_PLUGINS');
    expect(dts).not.toContain('createCli');
  });
});
