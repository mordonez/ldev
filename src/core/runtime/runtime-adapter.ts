import type {Printer} from '../output/printer.js';
import type {EnvLogsOptions, EnvLogsResult, EnvStartResult, EnvStopResult} from './env-types.js';
import type {EnvStatusReport} from './env-health.js';

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
