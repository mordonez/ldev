import type {LdevPlugin} from './plugin.js';
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

export const corePlugin: LdevPlugin = {
  name: 'core',
  version: '0.1.0',
  group: 'Core commands:',
  register(program) {
    for (const factory of [
      createEnvStartCommand,
      createEnvStopCommand,
      createEnvStatusCommand,
      createEnvLogsCommand,
      createEnvShellCommand,
      createEnvSetupCommand,
      createDoctorCommand,
      createContextCommand,
    ]) {
      program.addCommand(factory().helpGroup(this.group!));
    }
  },
};

export const workspacePlugin: LdevPlugin = {
  name: 'workspace',
  version: '0.1.0',
  group: 'Workspace commands:',
  register(program) {
    for (const factory of [createProjectCommand, createWorktreeCommand]) {
      program.addCommand(factory().helpGroup(this.group!));
    }
  },
};

export const runtimePlugin: LdevPlugin = {
  name: 'runtime',
  version: '0.1.0',
  group: 'Runtime commands:',
  register(program) {
    for (const factory of [createEnvCommand, createDbCommand, createDeployCommand, createOsgiCommand]) {
      program.addCommand(factory().helpGroup(this.group!));
    }
  },
};

export const liferayPlugin: LdevPlugin = {
  name: 'liferay',
  version: '0.1.0',
  group: 'Liferay commands:',
  register(program) {
    program.addCommand(createLiferayCommand().helpGroup(this.group!));
  },
};

export const aiPlugin: LdevPlugin = {
  name: 'ai',
  version: '0.1.0',
  group: 'Internal commands:',
  register(program) {
    program.addCommand(createAiCommand().helpGroup(this.group!), {hidden: true});
  },
};

/** All built-in plugins in registration order */
export const BUILTIN_PLUGINS: LdevPlugin[] = [corePlugin, workspacePlugin, runtimePlugin, liferayPlugin, aiPlugin];
