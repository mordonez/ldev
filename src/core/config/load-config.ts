import {resolveProjectContext} from './project-context.js';
import type {AppConfig} from './schema.js';

export function loadConfig(options?: {cwd?: string; env?: NodeJS.ProcessEnv; scopeAliasDefault?: string}): AppConfig {
  return resolveProjectContext({cwd: options?.cwd, env: options?.env, scopeAliasDefault: options?.scopeAliasDefault})
    .config;
}

export type {AppConfig} from './schema.js';
