/**
 * Shared result and option types for environment operations.
 * Defined in core/ so that RuntimeAdapter (core) and feature implementations
 * (features/env/) can share a common vocabulary without a circular dependency.
 */

export type EnvLogsOptions = {
  follow?: boolean;
  since?: string;
  service?: string;
  processEnv?: NodeJS.ProcessEnv;
};

export type EnvLogsResult = {
  ok: true;
  service: string | null;
  follow: boolean;
  since: string | null;
};

export type EnvStartResult = {
  ok: true;
  dockerDir: string;
  portalUrl: string;
  waitedForHealth: boolean;
  activationKeyFile: string | null;
};

export type EnvStopResult = {
  ok: true;
  dockerDir: string;
  stopped: boolean;
};
