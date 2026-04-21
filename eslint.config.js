import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', {allowNumber: true, allowBoolean: true}],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-misused-promises': ['error', {checksVoidReturn: false}],
      // Keep this family enabled by default. Narrow overrides below cover dynamic CLI/test surfaces.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'no-useless-assignment': 'off',
    },
  },
  // Architecture: core and features must not depend on the CLI layer
  {
    files: ['src/core/**/*.ts', 'src/features/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../cli/*', '../../cli/*', '../../../cli/*', '../../../../cli/*'],
              message: 'Core and feature modules must not depend on CLI-layer modules.',
            },
          ],
        },
      ],
    },
  },
  // Test mocks and JSON fixtures are intentionally dynamic — no-unsafe rules are too noisy there.
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  // Architecture: features must not use raw Node.js platform modules — use core/platform/ wrappers.
  {
    files: ['src/features/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['child_process', 'node:child_process'],
              message: 'Use core/platform/process.ts instead of child_process directly.',
            },
          ],
        },
      ],
    },
  },
  // Architecture: cross-feature imports are discouraged for newly touched feature code.
  {
    files: [
      'src/features/snapshot/**/*.ts',
      'src/features/worktree/**/*.ts',
      'src/features/deploy/**/*.ts',
      'src/features/db/**/*.ts',
      'src/features/doctor/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: [
                '../env/*',
                '../env',
                '../liferay/*',
                '../liferay',
                '../db/*',
                '../db',
                '../deploy/*',
                '../deploy',
                '../ai/*',
                '../ai',
                '../agent/*',
                '../agent',
                '../reindex/*',
                '../reindex',
                '../oauth/*',
                '../oauth',
                '../osgi/*',
                '../osgi',
              ],
              message: 'Cross-feature imports are discouraged. Extract shared logic to core/ instead. See #138.',
            },
          ],
        },
      ],
    },
  },
  // File size: warn when a source file exceeds 300 non-blank, non-comment lines.
  {
    files: ['src/features/**/*.ts', 'src/core/**/*.ts'],
    rules: {
      'max-lines': ['warn', {max: 300, skipBlankLines: true, skipComments: true}],
    },
  },
  // Existing large files are tracked for decomposition in #132, #133, #134.
  {
    files: [
      'src/core/config/project-context.ts',
      'src/features/ai/ai-install-project.ts',
      'src/features/ai/ai-install.ts',
      'src/features/db/db-files-download.ts',
      'src/features/doctor/doctor-collectors.ts',
      'src/features/liferay/content/liferay-content-stats.ts',
      'src/features/liferay/inventory/liferay-inventory-page-assemble.ts',
      'src/features/liferay/inventory/liferay-inventory-page-fetch-journal.ts',
      'src/features/liferay/inventory/liferay-inventory-page-fetch.ts',
      'src/features/liferay/inventory/liferay-inventory-page.ts',
      'src/features/liferay/page-layout/liferay-site-page-shared.ts',
      'src/features/liferay/resource/artifact-paths.ts',
      'src/features/liferay/resource/liferay-resource-migration.ts',
      'src/features/liferay/resource/liferay-resource-sync-fragments-api.ts',
      'src/features/liferay/resource/liferay-resource-sync-structure-migration.ts',
      'src/features/liferay/resource/sync-strategies/structure-sync-strategy.ts',
      'src/features/mcp/mcp.ts',
      'src/features/oauth/oauth-install.ts',
      'src/features/worktree/worktree-env.ts',
      'src/features/worktree/worktree-state.ts',
    ],
    rules: {
      'max-lines': 'off',
    },
  },
  {ignores: ['dist/', 'coverage/', 'templates/', '*.config.*', 'docs/']},
);
