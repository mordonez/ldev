import type {AppConfig} from '../../core/config/load-config.js';

import {openInteractiveGogo} from './osgi-shared.js';

export type OsgiGogoResult = {
  ok: true;
};

export async function runOsgiGogo(config: AppConfig): Promise<OsgiGogoResult> {
  await openInteractiveGogo(config, process.env);
  return {ok: true};
}
