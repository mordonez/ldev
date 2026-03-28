export const ROOT_HELP_SECTIONS = {
  quickStart: ['ldev doctor', 'ldev context --json', 'ldev setup', 'ldev start'],
  automationContract: ['ldev doctor --json', 'ldev context --json', 'ldev status --json'],
  examples: [
    'ldev doctor',
    'ldev setup',
    'ldev start',
    'ldev status',
    'ldev logs',
    'ldev liferay inventory sites --format json',
  ],
  advancedExamples: [
    'ldev context --json',
    'ldev project init --name foo --dir ~/projects/foo',
    'ldev db sync --project foo --environment prd --force',
    'ldev worktree setup --name issue-123 --with-env',
  ],
};
