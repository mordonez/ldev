import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/testing/**', 'src/index.ts'],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 60,
        statements: 55,
      },
    },
  },
});
