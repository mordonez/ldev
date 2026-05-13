/**
 * Re-exports Liferay connection config utilities from core/config.
 * Types and resolution logic live in core/config/liferay-connection-config.ts.
 */
export type {ResolvedLiferayConfigInput} from '../config/liferay-connection-config.js';
export {resolveLiferayConfig} from '../config/liferay-connection-config.js';
