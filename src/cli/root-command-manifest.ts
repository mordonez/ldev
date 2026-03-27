import type {Command} from 'commander';

import {createAiCommand} from '../commands/ai/ai.command.js';
import {createCapabilitiesCommand} from '../commands/capabilities/capabilities.command.js';
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
import {createReindexCommand} from '../commands/reindex/reindex.command.js';
import {createWorktreeCommand} from '../commands/worktree/worktree.command.js';

export type RootCommandEntry = {
  group: string;
  factory: () => Command;
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
  {group: 'Core commands:', factory: () => createCapabilitiesCommand()},
  {group: 'Project commands:', factory: () => createProjectCommand()},
  {group: 'Project commands:', factory: () => createEnvCommand()},
  {group: 'Project commands:', factory: () => createDbCommand()},
  {group: 'Project commands:', factory: () => createDeployCommand()},
  {group: 'Advanced runtime commands:', factory: () => createWorktreeCommand()},
  {group: 'Advanced runtime commands:', factory: () => createLiferayCommand()},
  {group: 'Advanced runtime commands:', factory: () => createOsgiCommand()},
  {group: 'Advanced runtime commands:', factory: () => createReindexCommand()},
  {group: 'Internal commands:', factory: () => createAiCommand()},
];

export const ROOT_HELP_SECTIONS = {
  quickStart: [
    'ldev doctor',
    'ldev context --json',
    'ldev setup',
    'ldev start',
  ],
  aliases: [
    'setup      Alias of env setup',
    'start      Alias of env start',
    'stop       Alias of env stop',
    'status     Alias of env status',
    'logs       Alias of env logs',
    'shell      Alias of env shell',
  ],
  agentContract: [
    'ldev doctor --json',
    'ldev context --json',
    'ldev capabilities --json',
    'ldev status --json',
  ],
  examples: [
    'ldev doctor',
    'ldev context --json',
    'ldev capabilities --json',
    'ldev setup',
    'ldev start',
    'ldev project init --name foo --dir ~/projects/foo',
    'ldev db sync --project foo --environment prd --force',
    'ldev worktree setup --name issue-123 --with-env',
    'ldev liferay inventory sites --format json',
  ],
};
