export const LINT_SCRIPT_FILES = Object.freeze([
  'scripts/check-doc-links.mjs',
  'scripts/eslint-script-files.mjs',
  'scripts/extract-pack-filename.mjs',
  'scripts/postprocess-docs-build.mjs',
  'scripts/run-eslint-scripts.mjs',
  'scripts/git-hooks/pre-commit.mjs',
  'scripts/verify-schema.mts',
]);

export const PROJECT_SERVICE_SCRIPT_FILES = Object.freeze(
  LINT_SCRIPT_FILES.filter((filePath) => filePath.endsWith('.mjs')),
);