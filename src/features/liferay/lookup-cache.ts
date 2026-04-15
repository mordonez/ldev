/**
 * R12: Shared TTL-aware cache for expensive Liferay lookups.
 *
 * Design:
 * - Default TTL: 5 minutes — short enough to avoid stale data on active portals.
 * - forceRefresh bypass for callers that need fresh data explicitly.
 * - clear() exposed for test isolation.
 * - Module-level named instances shared across features to deduplicate HTTP calls.
 */

export const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry<T> = {value: T; cachedAt: number};

export type LookupCacheOptions = {
  ttlMs?: number;
};

export class LookupCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(options?: LookupCacheOptions) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Return cached value if present and not expired.
   * @param forceRefresh If true, bypasses cache and returns undefined.
   */
  get(key: string, forceRefresh = false): T | undefined {
    if (forceRefresh) return undefined;
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {value, cachedAt: Date.now()});
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Shared cache for classNameId lookups (JSONWS classname/fetch-class-name).
 * Shared between liferay-resource-shared and liferay-inventory-page-fetch to
 * avoid duplicate HTTP calls for the same class name within the same session.
 */
export const classNameIdLookupCache = new LookupCache<number>();
