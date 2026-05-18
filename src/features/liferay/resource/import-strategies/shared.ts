import {CliError} from '../../../../core/errors.js';
import {LiferayErrors} from '../../errors/index.js';

export function isGatewayStatus(error: unknown, status: number): boolean {
  return (
    error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR' && error.message.includes(`status=${status}`)
  );
}

export function rethrowGatewayAsResourceError(error: unknown): never {
  if (error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR') {
    throw LiferayErrors.resourceError(error.message);
  }

  throw error;
}
