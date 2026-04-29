import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runOsgiThreadDump} from '../../osgi/osgi-thread-dump.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_osgi_thread_dump';

export const inputSchema = {
  count: z.number().int().min(1).max(20).optional().describe('Number of thread dumps to collect. Defaults to 6.'),
  intervalSeconds: z.number().int().min(1).max(60).optional().describe('Seconds between dumps. Defaults to 3.'),
};

export const description =
  'Run `ldev osgi thread-dump` and return where the generated thread dumps were written in the local project.';

export async function handleTool(input: {count?: number; intervalSeconds?: number}, config: AppConfig) {
  return runJsonTool(() =>
    runOsgiThreadDump(config, {
      count: clampInt(input.count, 6, 1, 20),
      intervalSeconds: clampInt(input.intervalSeconds, 3, 1, 60),
    }),
  );
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
