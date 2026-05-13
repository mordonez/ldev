import type {AppConfig} from '../../core/config/load-config.js';
import type {RuntimeAdapter, RuntimeStartOptions, RuntimeStopOptions} from '../../core/runtime/runtime-adapter.js';
import type {EnvLogsOptions, EnvLogsResult, EnvStartResult, EnvStopResult} from '../../core/runtime/env-types.js';
import type {EnvStatusReport} from '../../core/runtime/env-health.js';

import {runEnvLogs} from './env-logs.js';
import {runEnvStart} from './env-start.js';
import {runEnvStatus} from './env-status.js';
import {runEnvStop} from './env-stop.js';

export class LdevNativeRuntimeAdapter implements RuntimeAdapter {
  readonly kind = 'ldev-native';

  constructor(private readonly config: AppConfig) {}

  start(options?: RuntimeStartOptions): Promise<EnvStartResult> {
    return runEnvStart(this.config, options);
  }

  stop(options?: RuntimeStopOptions): Promise<EnvStopResult> {
    return runEnvStop(this.config, options);
  }

  status(options?: {processEnv?: NodeJS.ProcessEnv}): Promise<EnvStatusReport> {
    return runEnvStatus(this.config, options);
  }

  logs(options?: EnvLogsOptions): Promise<EnvLogsResult> {
    return runEnvLogs(this.config, options);
  }
}
