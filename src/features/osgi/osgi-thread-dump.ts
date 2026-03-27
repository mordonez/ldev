import type {AppConfig} from '../../core/config/load-config.js';

import {runLiferayScript} from './osgi-shared.js';

export type OsgiThreadDumpResult = {
  ok: true;
  count: number;
  intervalSeconds: number;
  outputDir: string;
};

export async function runOsgiThreadDump(
  config: AppConfig,
  options?: {count?: number; intervalSeconds?: number},
): Promise<OsgiThreadDumpResult> {
  const count = options?.count ?? 6;
  const intervalSeconds = options?.intervalSeconds ?? 3;
  await runLiferayScript(config, 'generate_thread_dump.sh', ['-d', '/opt/liferay/dumps', '-n', String(count), '-s', String(intervalSeconds)], process.env);

  return {
    ok: true,
    count,
    intervalSeconds,
    outputDir: './dumps',
  };
}

export function formatOsgiThreadDump(result: OsgiThreadDumpResult): string {
  return `Thread dumps guardados en ${result.outputDir}`;
}
