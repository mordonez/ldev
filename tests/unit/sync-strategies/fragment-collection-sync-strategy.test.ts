/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */

import {describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../../src/core/config/load-config.js';
import type {HttpApiClient} from '../../../src/core/http/client.js';
import {fragmentCollectionSyncStrategy} from '../../../src/features/liferay/resource/sync-strategies/fragment-collection-sync-strategy.js';
import type {ResolvedSite} from '../../../src/features/liferay/inventory/liferay-site-resolver.js';
import type {LocalFragmentCollection} from '../../../src/features/liferay/resource/liferay-resource-sync-fragments-types.js';

const mockConfig: AppConfig = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: null,
  liferayDir: null,
  files: {dockerEnv: null, liferayProfile: null},
  liferay: {
    url: 'http://localhost:8080',
    timeoutSeconds: 45,
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'client-secret',
    scopeAliases: 'default',
  },
  paths: {
    templates: 'liferay/resources/journal/templates',
    structures: 'liferay/resources/journal/structures',
    adts: 'liferay/resources/templates/application_display',
    fragments: 'liferay/fragments',
  },
};

const mockSite: ResolvedSite = {
  id: 20121,
  name: 'Test Site',
  friendlyUrlPath: '/test-site',
};

describe('fragmentCollectionSyncStrategy', () => {
  describe('resolveLocal', () => {
    test('returns LocalArtifact from collection', async () => {
      const collection: LocalFragmentCollection = {
        slug: 'my-collection',
        name: 'My Collection',
        description: 'Test collection',
        directoryPath: '/path/to/collection',
        fragments: [],
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map(),
      };

      const artifact = await fragmentCollectionSyncStrategy.resolveLocal(mockConfig, mockSite, {
        collection,
        runtimeState,
      });

      expect(artifact).not.toBeNull();
      expect(artifact!.id).toBe('my-collection');
      expect(artifact!.normalizedContent).toBeTruthy();
      expect(artifact!.contentHash).toBeTruthy();
      expect(artifact!.data.collection).toEqual(collection);
    });

    test('includes all fragment metadata in hash', async () => {
      const collection1: LocalFragmentCollection = {
        slug: 'collection-1',
        name: 'Collection 1',
        description: 'Description 1',
        directoryPath: '/path',
        fragments: [],
      };

      const collection2: LocalFragmentCollection = {
        slug: 'collection-1',
        name: 'Collection 1',
        description: 'Different Description',
        directoryPath: '/path',
        fragments: [],
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map(),
      };

      const artifact1 = await fragmentCollectionSyncStrategy.resolveLocal(mockConfig, mockSite, {
        collection: collection1,
        runtimeState,
      });

      const artifact2 = await fragmentCollectionSyncStrategy.resolveLocal(mockConfig, mockSite, {
        collection: collection2,
        runtimeState,
      });

      // Different descriptions should result in different hashes
      expect(artifact1!.contentHash).not.toBe(artifact2!.contentHash);
    });
  });

  describe('findRemote', () => {
    test('returns null when remote collection not found', async () => {
      const collection: LocalFragmentCollection = {
        slug: 'my-collection',
        name: 'My Collection',
        description: 'Test',
        directoryPath: '/path',
        fragments: [],
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map(),
      };

      const localArtifact = {
        id: 'my-collection',
        normalizedContent: '{"key":"my-collection"}',
        contentHash: 'hash-123',
        data: {collection},
      };

      const mockDependencies = {
        apiClient: {
          get: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            data: {items: []},
            headers: new Headers(),
            body: '{"items":[]}',
          }),
        } as any,
        tokenClient: {
          fetchClientCredentialsToken: vi.fn().mockResolvedValue({
            accessToken: 'token',
            tokenType: 'Bearer',
            expiresIn: 3600,
          }),
        } as any,
      };

      const result = await fragmentCollectionSyncStrategy.findRemote(
        mockConfig,
        mockSite,
        localArtifact,
        {collection, runtimeState},
        mockDependencies,
      );

      expect(result).toBeNull();
    });

    test('returns remote artifact when collection found', async () => {
      const collection: LocalFragmentCollection = {
        slug: 'my-collection',
        name: 'My Collection',
        description: 'Test',
        directoryPath: '/path',
        fragments: [],
      };

      const remoteCollection = {
        fragmentCollectionId: 100,
        fragmentCollectionKey: 'my-collection',
        name: 'My Collection',
        description: 'Test',
      };

      const runtimeState = {
        collectionsByKey: new Map([['my-collection', remoteCollection]]),
        fragmentsByCollectionId: new Map(),
      };

      const localArtifact = {
        id: 'my-collection',
        normalizedContent: '{"key":"my-collection"}',
        contentHash: 'hash-123',
        data: {collection},
      };

      const result = await fragmentCollectionSyncStrategy.findRemote(mockConfig, mockSite, localArtifact, {
        collection,
        runtimeState,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('100');
      expect(result?.name).toBe('my-collection');
      expect(result?.data).toEqual(remoteCollection);
    });
  });

  describe('upsert', () => {
    test('creates new collection when remote is null', async () => {
      const collection: LocalFragmentCollection = {
        slug: 'new-collection',
        name: 'New Collection',
        description: 'New',
        directoryPath: '/path',
        fragments: [],
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map(),
      };

      const localArtifact = {
        id: 'new-collection',
        normalizedContent: '{"key":"new-collection"}',
        contentHash: 'hash-new',
        data: {collection},
      };

      const createdCollection = {
        fragmentCollectionId: 200,
        fragmentCollectionKey: 'new-collection',
        name: 'New Collection',
        description: 'New',
      };

      const mockDependencies = {
        apiClient: {
          get: vi.fn(),
          postForm: vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            data: createdCollection,
            headers: new Headers(),
            body: JSON.stringify(createdCollection),
          }),
        } as any,
        tokenClient: {
          fetchClientCredentialsToken: vi.fn().mockResolvedValue({
            accessToken: 'token',
            tokenType: 'Bearer',
            expiresIn: 3600,
          }),
        } as any,
      };

      const result = await fragmentCollectionSyncStrategy.upsert(
        mockConfig,
        mockSite,
        localArtifact,
        null,
        {collection, runtimeState},
        mockDependencies,
      );

      expect(result.id).toBe('200');
      expect(result.name).toBe('new-collection');
    });

    test('updates existing collection when remote exists', async () => {
      const collection: LocalFragmentCollection = {
        slug: 'my-collection',
        name: 'Updated Collection',
        description: 'Updated',
        directoryPath: '/path',
        fragments: [],
      };

      const remoteCollection = {
        fragmentCollectionId: 100,
        fragmentCollectionKey: 'my-collection',
        name: 'My Collection',
        description: 'Old',
      };

      const runtimeState = {
        collectionsByKey: new Map([['my-collection', remoteCollection]]),
        fragmentsByCollectionId: new Map(),
      };

      const localArtifact = {
        id: 'my-collection',
        normalizedContent: '{"key":"my-collection"}',
        contentHash: 'hash-updated',
        data: {collection},
      };

      const remoteArtifact = {
        id: '100',
        name: 'my-collection',
        data: remoteCollection,
      };

      const mockDependencies = {
        apiClient: {
          get: vi.fn(),
          postForm: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            data: remoteCollection,
            headers: new Headers(),
            body: JSON.stringify(remoteCollection),
          }),
        } as any,
        tokenClient: {
          fetchClientCredentialsToken: vi.fn().mockResolvedValue({
            accessToken: 'token',
            tokenType: 'Bearer',
            expiresIn: 3600,
          }),
        } as any,
      };

      const result = await fragmentCollectionSyncStrategy.upsert(
        mockConfig,
        mockSite,
        localArtifact,
        remoteArtifact,
        {collection, runtimeState},
        mockDependencies,
      );

      expect(result.id).toBe('100');
      expect(result.name).toBe('my-collection');
    });
  });

  describe('verify', () => {
    test('completes without error (no-op verify)', async () => {
      const collection: LocalFragmentCollection = {
        slug: 'my-collection',
        name: 'My Collection',
        description: 'Test',
        directoryPath: '/path',
        fragments: [],
      };

      const remoteCollection = {
        fragmentCollectionId: 100,
        fragmentCollectionKey: 'my-collection',
        name: 'My Collection',
        description: 'Test',
      };

      const localArtifact = {
        id: 'my-collection',
        normalizedContent: '{"key":"my-collection"}',
        contentHash: 'hash-123',
        data: {collection},
      };

      const remoteArtifact = {
        id: '100',
        name: 'my-collection',
        data: remoteCollection,
      };

      // Fragment collection verify is no-op (best-effort legacy compat)
      await expect(
        fragmentCollectionSyncStrategy.verify(mockConfig, mockSite, localArtifact, remoteArtifact),
      ).resolves.not.toThrow();
    });
  });
});
