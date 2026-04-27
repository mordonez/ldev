import type {Printer} from '../output/printer.js';
import type {EnvLogsOptions, EnvLogsResult} from '../../features/env/env-logs.js';
import type {EnvStartResult} from '../../features/env/env-start.js';
import type {EnvStatusReport} from '../../features/env/env-health.js';
import type {EnvStopResult} from '../../features/env/env-stop.js';

export type RuntimeStartOptions = {
  wait?: boolean;
  timeoutSeconds?: number;
  processEnv?: NodeJS.ProcessEnv;
  printer?: Printer;
  activationKeyFile?: string;
};

export type RuntimeStopOptions = {
  removeVolumes?: boolean;
  processEnv?: NodeJS.ProcessEnv;
  printer?: Printer;
};

export interface RuntimeAdapter {
  readonly kind: string;
  start(options?: RuntimeStartOptions): Promise<EnvStartResult>;
  stop(options?: RuntimeStopOptions): Promise<EnvStopResult>;
  status(options?: {processEnv?: NodeJS.ProcessEnv}): Promise<EnvStatusReport>;
  logs(options?: EnvLogsOptions): Promise<EnvLogsResult>;
}
