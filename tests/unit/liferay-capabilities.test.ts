import {describe, expect, test} from 'vitest';

import {
  getOperationPolicy,
  type OperationName,
  type TransportSurface,
} from '../../src/features/liferay/inventory/capabilities.js';

const ALL_OPERATIONS: OperationName[] = ['site.resolve', 'inventory.listSites', 'inventory.listTemplates'];
const VALID_SURFACES: TransportSurface[] = [
  'headless-admin-site',
  'headless-admin-user',
  'headless-delivery',
  'jsonws',
];

describe('operation capabilities matrix', () => {
  test('every operation has a policy', () => {
    for (const op of ALL_OPERATIONS) {
      expect(() => getOperationPolicy(op)).not.toThrow();
    }
  });

  test('every policy has at least one surface', () => {
    for (const op of ALL_OPERATIONS) {
      const {surfaces} = getOperationPolicy(op);
      expect(surfaces.length).toBeGreaterThan(0);
    }
  });

  test('all surfaces are valid TransportSurface values', () => {
    for (const op of ALL_OPERATIONS) {
      const {surfaces} = getOperationPolicy(op);
      for (const surface of surfaces) {
        expect(VALID_SURFACES).toContain(surface);
      }
    }
  });

  test('site.resolve primary surface is headless-admin-site', () => {
    const policy = getOperationPolicy('site.resolve');
    expect(policy.surfaces[0]).toBe('headless-admin-site');
  });

  test('site.resolve surfaces in order: headless-admin-site, headless-admin-user, jsonws', () => {
    const policy = getOperationPolicy('site.resolve');
    expect(policy.surfaces).toEqual(['headless-admin-site', 'headless-admin-user', 'jsonws']);
  });

  test('inventory.listSites primary surface is headless-admin-site', () => {
    const policy = getOperationPolicy('inventory.listSites');
    expect(policy.surfaces[0]).toBe('headless-admin-site');
  });

  test('inventory.listSites surfaces in order: headless-admin-site, jsonws', () => {
    const policy = getOperationPolicy('inventory.listSites');
    expect(policy.surfaces).toEqual(['headless-admin-site', 'jsonws']);
  });

  test('inventory.listTemplates primary surface is headless-delivery', () => {
    const policy = getOperationPolicy('inventory.listTemplates');
    expect(policy.surfaces[0]).toBe('headless-delivery');
  });

  test('inventory.listTemplates surfaces in order: headless-delivery, jsonws', () => {
    const policy = getOperationPolicy('inventory.listTemplates');
    expect(policy.surfaces).toEqual(['headless-delivery', 'jsonws']);
  });

  test('all operations include jsonws as fallback surface', () => {
    for (const op of ALL_OPERATIONS) {
      const {surfaces} = getOperationPolicy(op);
      expect(surfaces).toContain('jsonws');
    }
  });

  test('unknown operation throws error', () => {
    // @ts-expect-error intentional invalid operation for testing
    expect(() => getOperationPolicy('unknown.op')).toThrow('No transport policy defined for operation: unknown.op');
  });

  test('policy operation field matches the operation name', () => {
    for (const op of ALL_OPERATIONS) {
      const policy = getOperationPolicy(op);
      expect(policy.operation).toBe(op);
    }
  });
});
