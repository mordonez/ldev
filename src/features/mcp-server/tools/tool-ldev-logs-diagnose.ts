import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runEnvLogsDiagnose} from '../../env/env-logs-diagnose.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'ldev_logs_diagnose';

export const inputSchema = {
  service: z.string().optional().describe('Docker compose service to inspect. Defaults to liferay.'),
  since: z.string().optional().describe('Limit logs to a duration or timestamp. Defaults to 10m.'),
};

export const description =
  'Analyze recent Docker logs like `ldev logs diagnose --json`, grouping exceptions and warning counts for agents.';

export async function handleTool(input: {service?: string; since?: string}, config: AppConfig) {
  return runJsonTool(() =>
    runEnvLogsDiagnose(config, {
      service: textOrDefault(input.service, 'liferay'),
      since: textOrDefault(input.since, '10m'),
      processEnv: process.env,
    }),
  );
}

function textOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}
