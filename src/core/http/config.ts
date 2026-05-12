// TODO: pre-existing core→features coupling; this re-export barrel should move to features/ or the types should move to core/ (see architecture audit)
/* eslint-disable no-restricted-imports */
export type {ResolvedLiferayConfigInput} from '../../features/liferay/liferay-connection-config.js';
export {resolveLiferayConfig} from '../../features/liferay/liferay-connection-config.js';
/* eslint-enable no-restricted-imports */
