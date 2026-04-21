import {describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../../src/core/config/load-config.js';
import {fragmentEntrySyncStrategy} from '../../../src/features/liferay/resource/sync-strategies/fragment-entry-sync-strategy.js';
import type {ResolvedSite} from '../../../src/features/liferay/inventory/liferay-site-resolver.js';
import type {LocalFragment} from '../../../src/features/liferay/resource/liferay-resource-sync-fragments-types.js';
import {mockApiClient, mockTokenClient} from './sync-strategy-test-helpers.js';

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

describe('fragmentEntrySyncStrategy', () => {
  describe('resolveLocal', () => {
    test('returns LocalArtifact from fragment', async () => {
      const fragment: LocalFragment = {
        slug: 'my-fragment',
        name: 'My Fragment',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>Fragment</div>',
        css: '.fragment { color: red; }',
        js: 'console.log("fragment");',
        configuration: '{"test": true}',
        directoryPath: '/path',
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map(),
      };

      const artifact = await fragmentEntrySyncStrategy.resolveLocal(mockConfig, mockSite, {
        collectionId: 100,
        fragment,
        runtimeState,
      });

      expect(artifact).not.toBeNull();
      expect(artifact!.id).toBe('my-fragment');
      expect(artifact!.normalizedContent).toBeTruthy();
      expect(artifact!.contentHash).toBeTruthy();
      expect(artifact!.data.collectionId).toBe(100);
      expect(artifact!.data.fragment).toEqual(fragment);
    });

    test('includes all fragment content in hash', async () => {
      const fragment1: LocalFragment = {
        slug: 'fragment-1',
        name: 'Fragment 1',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>Content 1</div>',
        css: '',
        js: '',
        configuration: '',
        directoryPath: '/path',
      };

      const fragment2: LocalFragment = {
        slug: 'fragment-1',
        name: 'Fragment 1',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>Different Content</div>',
        css: '',
        js: '',
        configuration: '',
        directoryPath: '/path',
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map(),
      };

      const artifact1 = await fragmentEntrySyncStrategy.resolveLocal(mockConfig, mockSite, {
        collectionId: 100,
        fragment: fragment1,
        runtimeState,
      });

      const artifact2 = await fragmentEntrySyncStrategy.resolveLocal(mockConfig, mockSite, {
        collectionId: 100,
        fragment: fragment2,
        runtimeState,
      });

      // Different HTML should result in different hashes
      expect(artifact1!.contentHash).not.toBe(artifact2!.contentHash);
    });
  });

  describe('findRemote', () => {
    test('returns null when remote fragment not found', async () => {
      const fragment: LocalFragment = {
        slug: 'my-fragment',
        name: 'My Fragment',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        directoryPath: '/path',
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map(),
      };

      const localArtifact = {
        id: 'my-fragment',
        normalizedContent: '{"key":"my-fragment"}',
        contentHash: 'hash-123',
        data: {collectionId: 100, fragment},
      };

      const mockDependencies = {
        apiClient: mockApiClient({
          get: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            data: {items: []},
            headers: new Headers(),
            body: '{"items":[]}',
          }),
        }),
        tokenClient: mockTokenClient(),
      };

      const result = await fragmentEntrySyncStrategy.findRemote(
        mockConfig,
        mockSite,
        localArtifact,
        {collectionId: 100, fragment, runtimeState},
        mockDependencies,
      );

      expect(result).toBeNull();
    });

    test('returns remote artifact when fragment found', async () => {
      const fragment: LocalFragment = {
        slug: 'my-fragment',
        name: 'My Fragment',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        directoryPath: '/path',
      };

      const remoteFragment = {
        fragmentEntryId: 200,
        fragmentEntryKey: 'my-fragment',
        name: 'My Fragment',
        html: '<div>Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        icon: 'icon.svg',
        type: 0,
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map([[100, new Map([['my-fragment', remoteFragment]])]]),
      };

      const localArtifact = {
        id: 'my-fragment',
        normalizedContent: '{"key":"my-fragment"}',
        contentHash: 'hash-123',
        data: {collectionId: 100, fragment},
      };

      const result = await fragmentEntrySyncStrategy.findRemote(mockConfig, mockSite, localArtifact, {
        collectionId: 100,
        fragment,
        runtimeState,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('200');
      expect(result?.name).toBe('my-fragment');
      expect(result?.data.collectionId).toBe(100);
    });
  });

  describe('upsert', () => {
    test('creates new fragment entry when remote is null', async () => {
      const fragment: LocalFragment = {
        slug: 'new-fragment',
        name: 'New Fragment',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>New Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        directoryPath: '/path',
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map(),
      };

      const localArtifact = {
        id: 'new-fragment',
        normalizedContent: '{"key":"new-fragment"}',
        contentHash: 'hash-new',
        data: {collectionId: 100, fragment},
      };

      const createdFragment = {
        fragmentEntryId: 300,
        fragmentEntryKey: 'new-fragment',
        name: 'New Fragment',
        html: '<div>New Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        icon: 'icon.svg',
        type: 0,
      };

      const mockDependencies = {
        apiClient: mockApiClient({
          get: vi.fn(),
          postForm: vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            data: createdFragment,
            headers: new Headers(),
            body: JSON.stringify(createdFragment),
          }),
        }),
        tokenClient: mockTokenClient(),
      };

      const result = await fragmentEntrySyncStrategy.upsert(
        mockConfig,
        mockSite,
        localArtifact,
        null,
        {collectionId: 100, fragment, runtimeState},
        mockDependencies,
      );

      expect(result.id).toBe('300');
      expect(result.name).toBe('new-fragment');
      expect(result.data.collectionId).toBe(100);
    });

    test('updates existing fragment entry when remote exists', async () => {
      const fragment: LocalFragment = {
        slug: 'my-fragment',
        name: 'Updated Fragment',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>Updated Fragment</div>',
        css: '.updated { color: blue; }',
        js: '',
        configuration: '',
        directoryPath: '/path',
      };

      const remoteFragment = {
        fragmentEntryId: 200,
        fragmentEntryKey: 'my-fragment',
        name: 'My Fragment',
        html: '<div>Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        icon: 'icon.svg',
        type: 0,
      };

      const runtimeState = {
        collectionsByKey: undefined,
        fragmentsByCollectionId: new Map([[100, new Map([['my-fragment', remoteFragment]])]]),
      };

      const localArtifact = {
        id: 'my-fragment',
        normalizedContent: '{"key":"my-fragment"}',
        contentHash: 'hash-updated',
        data: {collectionId: 100, fragment},
      };

      const remoteArtifact = {
        id: '200',
        name: 'my-fragment',
        data: {...remoteFragment, collectionId: 100},
      };

      const mockDependencies = {
        apiClient: mockApiClient({
          get: vi.fn(),
          postForm: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            data: remoteFragment,
            headers: new Headers(),
            body: JSON.stringify(remoteFragment),
          }),
        }),
        tokenClient: mockTokenClient(),
      };

      const result = await fragmentEntrySyncStrategy.upsert(
        mockConfig,
        mockSite,
        localArtifact,
        remoteArtifact,
        {collectionId: 100, fragment, runtimeState},
        mockDependencies,
      );

      expect(result.id).toBe('200');
      expect(result.name).toBe('my-fragment');
    });
  });

  describe('verify', () => {
    test('throws when fragment content does not match', async () => {
      const fragment: LocalFragment = {
        slug: 'my-fragment',
        name: 'My Fragment',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>Local Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        directoryPath: '/path',
      };

      const remoteFragment = {
        fragmentEntryId: 200,
        fragmentEntryKey: 'my-fragment',
        name: 'My Fragment',
        html: '<div>Remote Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        icon: 'icon.svg',
        type: 0,
      };

      const localArtifact = {
        id: 'my-fragment',
        normalizedContent: 'local-content',
        contentHash: 'hash-local',
        data: {collectionId: 100, fragment},
      };

      const remoteArtifact = {
        id: '200',
        name: 'my-fragment',
        contentHash: 'hash-remote',
        data: {...remoteFragment, collectionId: 100},
      };

      await expect(
        fragmentEntrySyncStrategy.verify(mockConfig, mockSite, localArtifact, remoteArtifact),
      ).rejects.toThrow();
    });

    test('skips verify when remote fragment does not include content fields', async () => {
      const fragment: LocalFragment = {
        slug: 'my-fragment',
        name: 'My Fragment',
        icon: 'icon.svg',
        type: 0,
        htmlPath: '/path/index.html',
        cssPath: '/path/styles.css',
        jsPath: '/path/script.js',
        configurationPath: '/path/configuration.json',
        html: '<div>Fragment</div>',
        css: '',
        js: '',
        configuration: '',
        directoryPath: '/path',
      };

      const remoteFragment = {
        fragmentEntryId: 200,
        fragmentEntryKey: 'my-fragment',
        name: 'My Fragment',
        // No html, css, js, configuration fields
        icon: 'icon.svg',
        type: 0,
      };

      const localArtifact = {
        id: 'my-fragment',
        normalizedContent: 'content',
        contentHash: 'hash-local',
        data: {collectionId: 100, fragment},
      };

      const remoteArtifact = {
        id: '200',
        name: 'my-fragment',
        data: {...remoteFragment, collectionId: 100},
      };

      // Should not throw because verify is skipped when content fields are missing
      await expect(
        fragmentEntrySyncStrategy.verify(mockConfig, mockSite, localArtifact, remoteArtifact),
      ).resolves.not.toThrow();
    });
  });
});
