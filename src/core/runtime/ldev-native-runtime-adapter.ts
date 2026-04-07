import type {AppConfig} from '../config/load-config.js';
import type {RuntimeAdapter, RuntimeStartOptions, RuntimeStopOptions} from './runtime-adapter.js';
import {runEnvLogs, type EnvLogsOptions, type EnvLogsResult} from '../../features/env/env-logs.js';
import {runEnvStart, type EnvStartResult} from '../../features/env/env-start.js';
import {runEnvStatus} from '../../features/env/env-status.js';
import {runEnvStop, type EnvStopResult} from '../../features/env/env-stop.js';
import type {EnvStatusReport} from '../../features/env/env-health.js';

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
