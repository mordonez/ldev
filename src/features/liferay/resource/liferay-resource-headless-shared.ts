/**
 * Small helpers for paginated, ERC-addressed Headless admin APIs
 * (object-admin, headless-admin-list-type).
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import {createLiferayGateway, isGatewayStatus} from '../liferay-gateway.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';

const PAGE_SIZE = 200;

type Page<T> = {items?: T[]; lastPage?: number};

/** GET every page of a Headless collection endpoint. */
export async function listAllPages<T>(
  config: AppConfig,
  basePath: string,
  label: string,
  dependencies?: ResourceDependencies,
): Promise<T[]> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const items: T[] = [];

  for (let page = 1; ; page++) {
    const response = await gateway.getJson<Page<T>>(`${basePath}?page=${page}&pageSize=${PAGE_SIZE}`, label);
    items.push(...(response.items ?? []));
    if (!response.items?.length || page >= (response.lastPage ?? 1)) {
      return items;
    }
  }
}

/** Run a gateway request, mapping 404 to null. */
export async function getOrNull<T>(request: () => Promise<T>): Promise<T | null> {
  try {
    return await request();
  } catch (error) {
    if (isGatewayStatus(error, 404)) {
      return null;
    }
    throw error;
  }
}
