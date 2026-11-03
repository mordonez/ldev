import {LiferayErrors} from '../../errors/index.js';
import {isGatewayError} from '../../liferay-gateway.js';

export {isGatewayStatus} from '../../liferay-gateway.js';

export function rethrowGatewayAsResourceError(error: unknown): never {
  if (isGatewayError(error)) {
    throw LiferayErrors.resourceError(error.message);
  }

  throw error;
}
