import {defineConfig} from 'vitest/config';

/**
 * Vitest configuration for the integration test lane.
 *
 * Key differences from the default config:
 * - pool: forks — each test file runs in a child process (more isolation for tests that
 *   spawn subprocesses and mutate temp directories)
 * - maxForks: 3 — caps concurrency to avoid CPU contention on 2-core CI runners;
 *   each file's tests run sequentially, so at most 3 CLI processes run at once
 * - testTimeout: 30000 — matches the expected per-test ceiling now that tests use
 *   node dist/index.js (~150ms startup) instead of npx tsx (~2-3s startup)
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 3,
      },
    },
    testTimeout: 30000,
  },
});
