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
      // Enabled as warn to surface type-safety gaps incrementally. Promote to error once resolved.
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
  // Architecture: features must not use raw Node.js platform modules — use core/platform/ wrappers.
  // Known existing violations: env-shell.ts, osgi-shared.ts (tracked in #138).
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
  // Architecture: cross-feature imports — warn on imports between top-level feature domains.
  // Known existing violations: snapshot→{env,db,liferay}, liferay→reindex, doctor→ai (tracked in #138).
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
                '../env/*', '../env',
                '../liferay/*', '../liferay',
                '../db/*', '../db',
                '../deploy/*', '../deploy',
                '../ai/*', '../ai',
                '../agent/*', '../agent',
                '../reindex/*', '../reindex',
                '../oauth/*', '../oauth',
                '../osgi/*', '../osgi',
              ],
              message: 'Cross-feature imports are discouraged. Extract shared logic to core/ instead. See #138.',
            },
          ],
        },
      ],
    },
  },
  // File size: warn when a source file exceeds 300 non-blank, non-comment lines.
  // Existing god files are tracked for decomposition in #132, #133, #134.
  {
    files: ['src/features/**/*.ts', 'src/core/**/*.ts'],
    rules: {
      'max-lines': ['warn', {max: 300, skipBlankLines: true, skipComments: true}],
    },
  },
  {ignores: ['dist/', 'coverage/', 'templates/', '*.config.*', 'docs/']},
);
