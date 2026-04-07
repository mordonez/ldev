import {Command} from 'commander';

import {registerWorktreeFlowCommands} from './worktree-commands-flow.js';
import {registerWorktreeMaintenanceCommands} from './worktree-commands-maintenance.js';

export function createWorktreeCommand(): Command {
  const command = new Command('worktree');

  command.description('Isolated git worktree and runtime tooling').addHelpText(
    'after',
    `
Use this namespace only when you need isolated branches with separate local runtime state.
If you are working in the main repo, you usually do not need these commands.
This is specialized tooling for teams or contributors who actively work with multiple isolated branches.

Typical flow:
  worktree setup --name issue-123 --with-env
  cd .worktrees/issue-123
  ldev start

Destructive commands:
  clean           Remove runtime data and the git worktree; requires --force
  gc --apply      Remove stale worktrees selected by age
`,
  );

  registerWorktreeFlowCommands(command);
  registerWorktreeMaintenanceCommands(command);

  return command;
}
