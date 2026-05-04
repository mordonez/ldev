import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

import {PROJECT_SERVICE_SCRIPT_FILES} from './scripts/eslint-script-files.mjs';

const SOURCE_FILES = ['src/core/**/*.ts', 'src/features/**/*.ts'];
const FEATURE_FILES = ['src/features/**/*.ts'];
const SCRIPT_FILES = ['scripts/**/*.mjs', 'scripts/**/*.mts'];

const SCRIPT_GLOBALS = {
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  URL: 'readonly',
};

const BASE_TYPESCRIPT_RULES = {
  '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/restrict-template-expressions': ['error', {allowNumber: true, allowBoolean: true}],
  '@typescript-eslint/no-unnecessary-condition': 'error',
  '@typescript-eslint/no-confusing-void-expression': 'error',
  '@typescript-eslint/no-misused-promises': ['error', {checksVoidReturn: false}],
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/no-base-to-string': 'error',
  '@typescript-eslint/no-redundant-type-constituents': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  'no-useless-assignment': 'error',
};

const cliLayerImportPatterns = [
  {
    group: ['../cli/*', '../../cli/*', '../../../cli/*', '../../../../cli/*'],
    message: 'Core and feature modules must not depend on CLI-layer modules.',
  },
];

const childProcessImportSelectors = [
  {
    selector:
      "ImportDeclaration[source.value='child_process'], ImportDeclaration[source.value='node:child_process']",
    message: 'Use core/platform/process.ts instead of child_process directly.',
  },
];

const discouragedCrossFeatureImportSelectors = [
  {
    selector: "ImportDeclaration[source.value=/^\\.\\.\\\/(env|liferay|db|deploy|ai|agent|reindex|oauth|osgi)(?:\\/|$)/]",
    message: 'Cross-feature imports are discouraged. Extract shared logic to core/ instead. See #138.',
  },
];

const CROSS_FEATURE_GUARD_FILES = [
  'src/features/worktree/**/*.ts',
  'src/features/deploy/**/*.ts',
  'src/features/db/**/*.ts',
  'src/features/doctor/**/*.ts',
];

const LARGE_FILE_EXCEPTIONS = [
  'src/core/config/project-context.ts',
  'src/features/ai/ai-install-project.ts',
  'src/features/ai/ai-install.ts',
  'src/features/db/db-files-download.ts',
  'src/features/dashboard/dashboard-html.ts',
  'src/features/dashboard/dashboard-server.ts',
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
];

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
    rules: BASE_TYPESCRIPT_RULES,
  },
  {
    files: SCRIPT_FILES,
    languageOptions: {
      globals: SCRIPT_GLOBALS,
      parserOptions: {
        projectService: {
          allowDefaultProject: PROJECT_SERVICE_SCRIPT_FILES,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Architecture: core and features must not depend on the CLI layer
  {
    files: SOURCE_FILES,
    rules: {
      'no-restricted-imports': ['error', {patterns: cliLayerImportPatterns}],
    },
  },
  // Architecture: features must not use raw Node.js platform modules — use core/platform/ wrappers.
  {
    files: FEATURE_FILES,
    rules: {
      'no-restricted-syntax': ['warn', ...childProcessImportSelectors],
    },
  },
  // Architecture: cross-feature imports are discouraged for newly touched feature code.
  {
    files: CROSS_FEATURE_GUARD_FILES,
    rules: {
      'no-restricted-syntax': [
        'warn',
        ...childProcessImportSelectors,
        ...discouragedCrossFeatureImportSelectors,
      ],
    },
  },
  // File size: warn when a source file exceeds 300 non-blank, non-comment lines.
  {
    files: SOURCE_FILES,
    rules: {
      'max-lines': ['warn', {max: 300, skipBlankLines: true, skipComments: true}],
    },
  },
  // Existing large files are tracked for decomposition in #132, #133, #134.
  {
    files: LARGE_FILE_EXCEPTIONS,
    rules: {
      'max-lines': 'off',
    },
  },
  {ignores: ['dist/', 'coverage/', 'templates/', '*.config.*', 'docs/']},
);
