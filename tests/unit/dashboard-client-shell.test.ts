import fs from 'node:fs';

import {describe, expect, test} from 'vitest';

describe('dashboard client shell', () => {
  test('declares the Vite entrypoint for the Preact app', () => {
    const index = fs.readFileSync('src/features/dashboard/client/index.html', 'utf8');

    expect(index).toMatch(/<div id="dashboard-root"><\/div>/);
    expect(index).toMatch(/<script type="module" src="\.\/app\.jsx"><\/script>/);
  });
});
