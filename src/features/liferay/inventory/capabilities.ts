/**
 * R4: Declarative operation policies — which transport surfaces to try, in order.
 *
 * Each operation declares the surfaces (API endpoints/protocols) it can use,
 * in order of preference. The operation implementation reads the policy and
 * executes surfaces in order, with fallback chain semantics.
 *
 * Surfaces:
 * - headless-admin-site: Liferay Headless Admin Site API (/o/headless-admin-site)
 * - headless-admin-user: Liferay Headless Admin User API (/o/headless-admin-user) - includes company groups
 * - headless-delivery: Liferay Headless Delivery API (/o/headless-delivery)
 * - jsonws: Legacy Liferay JSONWS RPC API (/api/jsonws)
 */

import {CliError} from '../../../core/errors.js';

export type OperationName = 'site.resolve' | 'inventory.listSites' | 'inventory.listTemplates';

export type TransportSurface = 'headless-admin-site' | 'headless-admin-user' | 'headless-delivery' | 'jsonws';

export type OperationPolicy = {
  readonly operation: OperationName;
  /**
   * Ordered surfaces: primary first, fallbacks in order.
   * At least one surface required (hence [TransportSurface, ...TransportSurface[]]).
   */
  readonly surfaces: readonly [TransportSurface, ...TransportSurface[]];
};

const POLICIES: ReadonlyMap<OperationName, OperationPolicy> = new Map<OperationName, OperationPolicy>([
  [
    'site.resolve',
    {
      operation: 'site.resolve',
      surfaces: ['headless-admin-site', 'headless-admin-user', 'jsonws'],
    },
  ],
  [
    'inventory.listSites',
    {
      operation: 'inventory.listSites',
      surfaces: ['headless-admin-site', 'jsonws'],
    },
  ],
  [
    'inventory.listTemplates',
    {
      operation: 'inventory.listTemplates',
      surfaces: ['headless-delivery', 'jsonws'],
    },
  ],
]);

/**
 * Get the transport policy for an operation.
 * @param operation The operation name
 * @returns The policy defining surfaces to try and their order
 * @throws Error if no policy is defined for the operation
 */
export function getOperationPolicy(operation: OperationName): OperationPolicy {
  const policy = POLICIES.get(operation);
  if (!policy) {
    throw new CliError(`No transport policy defined for operation: ${operation}`, {code: 'LIFERAY_INVENTORY_ERROR'});
  }
  return policy;
}
