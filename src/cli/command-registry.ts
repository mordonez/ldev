export const ROOT_HELP_SECTIONS = {
  quickStart: ['ldev doctor', 'ldev context --json', 'ldev setup', 'ldev start', 'ldev oauth install --write-env'],
  automationContract: ['ldev doctor --json', 'ldev context --json', 'ldev status --json'],
  examples: [
    'ldev doctor',
    'ldev setup',
    'ldev start',
    'ldev oauth install --write-env',
    'ldev status',
    'ldev logs',
    'ldev portal inventory sites --json',
    'ldev resource export-structures --site /my-site',
  ],
  advancedExamples: [
    'ldev context --json',
    'ldev project init --name foo --dir ~/projects/foo',
    'ldev db sync --project foo --environment prd --force',
    'ldev worktree setup --name issue-123 --with-env',
  ],
};
