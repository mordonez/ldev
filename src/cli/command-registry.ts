import type {Command} from 'commander';

import {createAiCommand} from '../commands/ai/ai.command.js';
import {createContextCommand} from '../commands/context/context.command.js';
import {createDbCommand} from '../commands/db/db.command.js';
import {createDeployCommand} from '../commands/deploy/deploy.command.js';
import {createDoctorCommand} from '../commands/doctor/doctor.command.js';
import {createEnvCommand} from '../commands/env/env.command.js';
import {
  createEnvLogsCommand,
  createEnvSetupCommand,
  createEnvShellCommand,
  createEnvStartCommand,
  createEnvStatusCommand,
  createEnvStopCommand,
} from '../commands/env/env-public.commands.js';
import {createLiferayCommand} from '../commands/liferay/liferay.command.js';
import {createOsgiCommand} from '../commands/osgi/osgi.command.js';
import {createProjectCommand} from '../commands/project/project.command.js';
import {createWorktreeCommand} from '../commands/worktree/worktree.command.js';

export type RootCommandEntry = {
  group: string;
  factory: () => Command;
  hidden?: boolean;
};

export const ROOT_COMMANDS: RootCommandEntry[] = [
  {group: 'Core commands:', factory: () => createEnvStartCommand()},
  {group: 'Core commands:', factory: () => createEnvStopCommand()},
  {group: 'Core commands:', factory: () => createEnvStatusCommand()},
  {group: 'Core commands:', factory: () => createEnvLogsCommand()},
  {group: 'Core commands:', factory: () => createEnvShellCommand()},
  {group: 'Core commands:', factory: () => createEnvSetupCommand()},
  {group: 'Core commands:', factory: () => createDoctorCommand()},
  {group: 'Core commands:', factory: () => createContextCommand()},
  {group: 'Workspace commands:', factory: () => createProjectCommand()},
  {group: 'Workspace commands:', factory: () => createWorktreeCommand()},
  {group: 'Runtime commands:', factory: () => createEnvCommand()},
  {group: 'Runtime commands:', factory: () => createDbCommand()},
  {group: 'Runtime commands:', factory: () => createDeployCommand()},
  {group: 'Runtime commands:', factory: () => createOsgiCommand()},
  {group: 'Liferay commands:', factory: () => createLiferayCommand()},
  {group: 'Internal commands:', factory: () => createAiCommand(), hidden: true},
];

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
