import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/smoke/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/testing/**', 'src/index.ts'],
      thresholds: {
        lines: 40,
        functions: 50,
        branches: 50,
        statements: 40,
      },
    },
  },
});
