import type {AppConfig} from '../../core/config/load-config.js';

import {refreshIndices, updateRefreshInterval} from './reindex-shared.js';

export type ReindexSpeedupResult = {
  ok: true;
  enabled: boolean;
};

export async function runReindexSpeedup(config: AppConfig, options: {enabled: boolean}): Promise<ReindexSpeedupResult> {
  if (options.enabled) {
    await updateRefreshInterval(config, '-1');
  } else {
    await updateRefreshInterval(config, '1s');
    await refreshIndices(config);
  }

  return {
    ok: true,
    enabled: options.enabled,
  };
}

export function formatReindexSpeedup(result: ReindexSpeedupResult): string {
  return result.enabled
    ? 'Reindex speedup ON (refresh_interval=-1)'
    : 'Reindex speedup OFF (refresh_interval=1s + refresh)';
}
