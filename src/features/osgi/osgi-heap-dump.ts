import type {AppConfig} from '../../core/config/load-config.js';

import {runLiferayScript} from './osgi-shared.js';

export type OsgiHeapDumpResult = {
  ok: true;
  outputDir: string;
};

export async function runOsgiHeapDump(config: AppConfig): Promise<OsgiHeapDumpResult> {
  await runLiferayScript(config, 'generate_heap_dump.sh', ['-d', '/opt/liferay/dumps'], process.env);

  return {
    ok: true,
    outputDir: './dumps',
  };
}

export function formatOsgiHeapDump(result: OsgiHeapDumpResult): string {
  return `Heap dump guardado en ${result.outputDir}`;
}
