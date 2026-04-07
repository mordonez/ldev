import type {CommandGroup} from './command-group.js';
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
import {createHealthCommand} from '../commands/health/health.command.js';
import {createPortalCommand} from '../commands/liferay/liferay.command.js';
import {createFeatureFlagsCommand} from '../commands/feature-flags/feature-flags.command.js';
import {createMcpCommand} from '../commands/mcp/mcp.command.js';
import {createOsgiCommand} from '../commands/osgi/osgi.command.js';
import {createOAuthCommand} from '../commands/oauth/oauth.command.js';
import {createPerfCommand} from '../commands/perf/perf.command.js';
import {createProjectCommand} from '../commands/project/project.command.js';
import {createResourceCommand} from '../commands/resource/resource.command.js';
import {createRestoreCommand, createSnapshotCommand} from '../commands/snapshot/snapshot.command.js';
import {createWorktreeCommand} from '../commands/worktree/worktree.command.js';

export const coreGroup: CommandGroup = {
  name: 'core',
  version: '0.1.0',
  group: 'Core workflows:',
  register(program) {
    for (const factory of [
      createContextCommand,
      createEnvSetupCommand,
      createEnvStartCommand,
      createEnvStopCommand,
      createEnvStatusCommand,
      createEnvLogsCommand,
      createEnvShellCommand,
      createDoctorCommand,
    ]) {
      program.addCommand(factory().helpGroup(this.group!));
    }
  },
};

export const portalGroup: CommandGroup = {
  name: 'portal',
  version: '0.1.0',
  group: 'Liferay API tooling:',
  register(program) {
    program.addCommand(createPortalCommand().helpGroup(this.group!));
    program.addCommand(createMcpCommand().helpGroup(this.group!));
    program.addCommand(createFeatureFlagsCommand().helpGroup(this.group!));
    program.addCommand(createOAuthCommand().helpGroup(this.group!));
  },
};

export const resourceGroup: CommandGroup = {
  name: 'resource',
  version: '0.1.0',
  group: 'Liferay API tooling:',
  register(program) {
    program.addCommand(createResourceCommand().helpGroup(this.group!));
  },
};

export const bootstrapGroup: CommandGroup = {
  name: 'bootstrap',
  version: '0.1.0',
  group: 'Project bootstrap:',
  register(program) {
    program.addCommand(createProjectCommand().helpGroup(this.group!));
  },
};

export const infrastructureGroup: CommandGroup = {
  name: 'infrastructure',
  version: '0.1.0',
  group: 'Advanced local tooling:',
  register(program) {
    for (const factory of [
      createDeployCommand,
      createEnvCommand,
      createDbCommand,
      createOsgiCommand,
      createWorktreeCommand,
    ]) {
      program.addCommand(factory().helpGroup(this.group!));
    }
  },
};

/** Hidden commands: available to call but not shown in root help */
export const hiddenGroup: CommandGroup = {
  name: 'hidden',
  version: '0.1.0',
  register(program) {
    for (const factory of [createHealthCommand, createPerfCommand, createSnapshotCommand, createRestoreCommand]) {
      program.addCommand(factory(), {hidden: true});
    }
    program.addCommand(createAiCommand(), {hidden: true});
  },
};

/** All built-in command groups in registration order */
export const COMMAND_GROUPS: CommandGroup[] = [
  coreGroup,
  bootstrapGroup,
  portalGroup,
  resourceGroup,
  infrastructureGroup,
  hiddenGroup,
];
