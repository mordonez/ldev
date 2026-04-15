import {describe, expect, test, vi} from 'vitest';

import {DEFAULT_TTL_MS, LookupCache, classNameIdLookupCache} from '../../src/features/liferay/lookup-cache.js';

describe('LookupCache', () => {
  describe('get', () => {
    test('returns undefined on cache miss', () => {
      const cache = new LookupCache<number>();
      expect(cache.get('missing')).toBeUndefined();
    });

    test('returns value on cache hit', () => {
      const cache = new LookupCache<number>();
      cache.set('key', 42);
      expect(cache.get('key')).toBe(42);
    });

    test('returns undefined when forceRefresh is true (bypass)', () => {
      const cache = new LookupCache<number>();
      cache.set('key', 42);
      expect(cache.get('key', true)).toBeUndefined();
    });

    test('returns value when forceRefresh is false (no bypass)', () => {
      const cache = new LookupCache<number>();
      cache.set('key', 42);
      expect(cache.get('key', false)).toBe(42);
    });

    test('returns undefined after TTL expires', () => {
      const cache = new LookupCache<string>({ttlMs: 100});
      cache.set('key', 'value');

      // Simulate TTL expiry by mocking Date.now
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 200);

      expect(cache.get('key')).toBeUndefined();

      vi.restoreAllMocks();
    });

    test('returns value before TTL expires', () => {
      const cache = new LookupCache<string>({ttlMs: 10_000});
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    test('removes expired entry from internal map on access', () => {
      const cache = new LookupCache<number>({ttlMs: 100});
      cache.set('key', 1);

      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 200);

      cache.get('key'); // triggers removal
      vi.restoreAllMocks();

      // After restoring Date.now, the entry should be absent (was evicted)
      expect(cache.get('key')).toBeUndefined();
    });
  });

  describe('set', () => {
    test('overwrites existing value', () => {
      const cache = new LookupCache<number>();
      cache.set('key', 1);
      cache.set('key', 2);
      expect(cache.get('key')).toBe(2);
    });
  });

  describe('clear', () => {
    test('removes all entries', () => {
      const cache = new LookupCache<number>();
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('DEFAULT_TTL_MS', () => {
    test('is 5 minutes', () => {
      expect(DEFAULT_TTL_MS).toBe(5 * 60 * 1000);
    });
  });

  describe('classNameIdLookupCache (shared instance)', () => {
    test('is a LookupCache<number>', () => {
      expect(classNameIdLookupCache).toBeInstanceOf(LookupCache);
    });

    test('shared instance is isolated when cleared', () => {
      classNameIdLookupCache.clear();
      classNameIdLookupCache.set('http://localhost:8080|com.example.Model', 999);
      expect(classNameIdLookupCache.get('http://localhost:8080|com.example.Model')).toBe(999);
      classNameIdLookupCache.clear();
      expect(classNameIdLookupCache.get('http://localhost:8080|com.example.Model')).toBeUndefined();
    });
  });
});
