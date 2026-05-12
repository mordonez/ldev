import {resolveLiferayConfig as resolveLiferayConfigCore} from '../../core/config/liferay-connection-config.js';
import {DEFAULT_OAUTH_SCOPE_ALIASES_STRING} from '../oauth/oauth-scope-aliases.js';

export type {ResolvedLiferayConfigInput} from '../../core/config/liferay-connection-config.js';

/**
 * Resolves the Liferay connection config, applying the default OAuth scope aliases.
 * This wrapper exists so callers in features/ don't need to pass the scope default explicitly;
 * the full core function is in core/config/liferay-connection-config.ts.
 */
export function resolveLiferayConfig(input: {
  processEnv: NodeJS.ProcessEnv;
  dockerEnv: Record<string, string>;
  localProfile: Record<string, string>;
}) {
  return resolveLiferayConfigCore({
    ...input,
    scopeAliasDefault: DEFAULT_OAUTH_SCOPE_ALIASES_STRING,
  });
}
