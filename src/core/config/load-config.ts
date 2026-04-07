import {resolveProjectContext} from './project-context.js';
import type {AppConfig} from './schema.js';

export function loadConfig(options?: {cwd?: string; env?: NodeJS.ProcessEnv}): AppConfig {
  return resolveProjectContext({cwd: options?.cwd, env: options?.env}).config;
}

export type {AppConfig} from './schema.js';
