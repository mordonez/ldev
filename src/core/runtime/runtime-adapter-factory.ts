import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../config/load-config.js';
import {resolveProjectContext} from '../config/project-context.js';
import {BladeWorkspaceRuntimeAdapter} from './blade-workspace-runtime-adapter.js';
import {LdevNativeRuntimeAdapter} from './ldev-native-runtime-adapter.js';
import type {RuntimeAdapter} from './runtime-adapter.js';

export function createRuntimeAdapter(
  config: AppConfig,
  options?: {projectType?: ReturnType<typeof resolveProjectContext>['projectType']},
): RuntimeAdapter {
  const projectType = options?.projectType ?? resolveProjectContext({cwd: config.cwd}).projectType;

  if (projectType === 'ldev-native') {
    return new LdevNativeRuntimeAdapter(config);
  }

  if (projectType === 'blade-workspace') {
    return new BladeWorkspaceRuntimeAdapter(config);
  }

  throw new CliError('No supported runtime project was detected.', {
    code: 'RUNTIME_PROJECT_NOT_FOUND',
  });
}
