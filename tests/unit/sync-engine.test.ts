import {describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import type {ResolvedSite} from '../../src/features/liferay/inventory/liferay-site-resolver.js';
import {
  syncArtifact,
  syncArtifactDetailed,
  type LocalArtifact,
  type RemoteArtifact,
} from '../../src/features/liferay/resource/sync-engine.js';
import {mockApiClient, mockTokenClient} from './sync-strategies/sync-strategy-test-helpers.js';

const mockConfig: AppConfig = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: null,
  liferayDir: null,
  files: {
    dockerEnv: null,
    liferayProfile: null,
  },
  liferay: {
    url: 'http://localhost:8080',
    timeoutSeconds: 45,
    oauth2ClientId: 'test-client',
    oauth2ClientSecret: 'test-secret',
    scopeAliases: 'default',
  },
};

const mockSite: ResolvedSite = {
  id: 20121,
  name: 'Test Site',
  friendlyUrlPath: '/test-site',
};

type TestLocalData = {value: string};
type TestRemoteData = {remoteValue: string};

const createMockStrategy = (
  localArtifact: LocalArtifact<TestLocalData> | null = null,
  remoteArtifact: RemoteArtifact<TestRemoteData> | null = null,
  shouldThrowUpsert = false,
  shouldThrowVerify = false,
  previewArtifact: RemoteArtifact<TestRemoteData> | null = null,
) => ({
  resolveLocal: vi.fn(async () => {
    await Promise.resolve();
    return localArtifact ?? null;
  }),
  findRemote: vi.fn(async () => {
    await Promise.resolve();
    return remoteArtifact ?? null;
  }),
  upsert: vi.fn(async () => {
    await Promise.resolve();
    if (shouldThrowUpsert) {
      throw new Error('Upsert failed');
    }
    return (
      remoteArtifact || {
        id: 'new-id',
        name: 'test-key',
        data: {remoteValue: 'updated'},
      }
    );
  }),
  verify: vi.fn(async () => {
    await Promise.resolve();
    if (shouldThrowVerify) {
      throw new Error('Verify failed');
    }
  }),
  preview: vi.fn(async () => {
    await Promise.resolve();
    return previewArtifact ?? remoteArtifact!;
  }),
});

describe('syncArtifact', () => {
  describe('core orchestration', () => {
    test('resolves local artifact, finds remote, upserts, and verifies', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const remoteArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id',
        name: 'test-key',
        contentHash: 'hash-456',
        data: {remoteValue: 'existing'},
      };

      const strategy = createMockStrategy(localArtifact, remoteArtifact);

      const result = await syncArtifact(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: false,
      });

      expect(strategy.resolveLocal).toHaveBeenCalledWith(mockConfig, mockSite, {});

      expect(strategy.findRemote).toHaveBeenCalledWith(mockConfig, mockSite, localArtifact, {}, undefined);

      expect(strategy.upsert).toHaveBeenCalledWith(mockConfig, mockSite, localArtifact, remoteArtifact, {}, undefined);

      expect(strategy.verify).toHaveBeenCalled();
      expect(result.status).toBe('updated');
      expect(result.id).toBe('remote-id');
    });

    test('creates new artifact when remote does not exist', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'new-key',
        normalizedContent: '{"value":"new"}',
        contentHash: 'hash-new',
        data: {value: 'new'},
      };

      const strategy = createMockStrategy(localArtifact, null);

      const result = await syncArtifact(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: false,
      });

      expect(strategy.upsert).toHaveBeenCalledWith(mockConfig, mockSite, localArtifact, null, {}, undefined);
      expect(result.status).toBe('created');
    });
  });

  describe('checkOnly mode', () => {
    test('does not call upsert in checkOnly mode', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const remoteArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id',
        name: 'test-key',
        data: {remoteValue: 'existing'},
      };

      const strategy = createMockStrategy(localArtifact, remoteArtifact);

      const result = await syncArtifact(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: true,
      });

      expect(strategy.upsert).not.toHaveBeenCalled();
      expect(result.status).toBe('checked');
    });

    test('uses strategy preview when checkOnly requires artifact-specific validation', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const remoteArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id',
        name: 'test-key',
        data: {remoteValue: 'existing'},
      };

      const previewArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id',
        name: 'test-key',
        data: {remoteValue: 'previewed'},
      };

      const strategy = createMockStrategy(localArtifact, remoteArtifact, false, false, previewArtifact);

      const outcome = await syncArtifactDetailed(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: true,
      });

      expect(strategy.upsert).not.toHaveBeenCalled();
      expect(strategy.preview).toHaveBeenCalledWith(mockConfig, mockSite, localArtifact, remoteArtifact, {}, undefined);
      expect(outcome.result.status).toBe('checked');
      expect(outcome.changedRemoteArtifact).toEqual(previewArtifact);
    });

    test('returns checked_missing when remote missing in checkOnly mode with createMissing', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'missing-key',
        normalizedContent: '{"value":"missing"}',
        contentHash: 'hash-missing',
        data: {value: 'missing'},
      };

      const strategy = createMockStrategy(localArtifact, null);

      const result = await syncArtifact(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: true,
      });

      expect(result.status).toBe('checked_missing');
      expect(result.name).toBe('missing-key');
    });
  });

  describe('createMissing flag', () => {
    test('throws when remote artifact missing and createMissing=false', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const strategy = createMockStrategy(localArtifact, null);

      await expect(
        syncArtifact(mockConfig, mockSite, strategy, {
          createMissing: false,
          checkOnly: false,
        }),
      ).rejects.toThrow('does not exist and create-missing is not enabled');
    });

    test('allows creation when createMissing=true even if remote missing', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'new-key',
        normalizedContent: '{"value":"new"}',
        contentHash: 'hash-new',
        data: {value: 'new'},
      };

      const strategy = createMockStrategy(localArtifact, null);

      const result = await syncArtifact(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: false,
      });

      expect(strategy.upsert).toHaveBeenCalled();
      expect(result.status).toBe('created');
    });
  });

  describe('error handling', () => {
    test('propagates resolveLocal errors', async () => {
      const strategy = createMockStrategy();
      vi.mocked(strategy.resolveLocal).mockRejectedValue(new Error('File not found'));

      await expect(
        syncArtifact(mockConfig, mockSite, strategy, {createMissing: true, checkOnly: false}),
      ).rejects.toThrow('File not found');
    });

    test('throws when local artifact not found', async () => {
      const strategy = createMockStrategy(null);

      try {
        await syncArtifact(mockConfig, mockSite, strategy, {createMissing: true, checkOnly: false});
        throw new Error('Expected syncArtifact to throw');
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String(error.code) : '';
        expect(code).toContain('FILE_NOT_FOUND');
      }
    });

    test('propagates findRemote errors', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const strategy = createMockStrategy(localArtifact);
      vi.mocked(strategy.findRemote).mockRejectedValue(new Error('API error'));

      await expect(
        syncArtifact(mockConfig, mockSite, strategy, {createMissing: true, checkOnly: false}),
      ).rejects.toThrow('API error');
    });

    test('propagates upsert errors', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const strategy = createMockStrategy(localArtifact, null, true);

      await expect(
        syncArtifact(mockConfig, mockSite, strategy, {createMissing: true, checkOnly: false}),
      ).rejects.toThrow('Upsert failed');
    });

    test('propagates verify errors', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const remoteArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id',
        name: 'test-key',
        data: {remoteValue: 'existing'},
      };

      const strategy = createMockStrategy(localArtifact, remoteArtifact, false, true);

      await expect(
        syncArtifact(mockConfig, mockSite, strategy, {createMissing: true, checkOnly: false}),
      ).rejects.toThrow('Verify failed');
    });
  });

  describe('result structure', () => {
    test('returns correct result structure on update', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const remoteArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id-123',
        name: 'test-key',
        data: {remoteValue: 'existing'},
      };

      const strategy = createMockStrategy(localArtifact, remoteArtifact);

      const result = await syncArtifact(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: false,
      });

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('extra');
      expect(result.id).toBe('remote-id-123');
      expect(result.name).toBe('test-key');
    });

    test('returns created status for new artifacts', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'new-key',
        normalizedContent: '{"value":"new"}',
        contentHash: 'hash-new',
        data: {value: 'new'},
      };

      const strategy = createMockStrategy(localArtifact, null);

      const result = await syncArtifact(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: false,
      });

      expect(result.status).toBe('created');
    });
  });

  describe('strategy options', () => {
    test('passes strategyOptions to strategy methods', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const remoteArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id',
        name: 'test-key',
        data: {remoteValue: 'existing'},
      };

      const strategy = createMockStrategy(localArtifact, remoteArtifact);
      const customOptions = {customKey: 'customValue'};

      await syncArtifact(mockConfig, mockSite, strategy, {
        createMissing: true,
        checkOnly: false,
        strategyOptions: customOptions,
      });

      expect(strategy.resolveLocal).toHaveBeenCalledWith(mockConfig, mockSite, customOptions);
      expect(strategy.findRemote).toHaveBeenCalledWith(mockConfig, mockSite, localArtifact, customOptions, undefined);
      expect(strategy.upsert).toHaveBeenCalledWith(
        mockConfig,
        mockSite,
        localArtifact,
        remoteArtifact,
        customOptions,
        undefined,
      );
    });
  });

  describe('dependencies passing', () => {
    test('passes dependencies to strategy methods', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const remoteArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id',
        name: 'test-key',
        data: {remoteValue: 'existing'},
      };

      const strategy = createMockStrategy(localArtifact, remoteArtifact);
      const mockDependencies = {apiClient: mockApiClient({}), tokenClient: mockTokenClient()};

      await syncArtifact(mockConfig, mockSite, strategy, {createMissing: true, checkOnly: false}, mockDependencies);

      expect(strategy.findRemote).toHaveBeenCalledWith(mockConfig, mockSite, localArtifact, {}, mockDependencies);
      expect(strategy.upsert).toHaveBeenCalledWith(
        mockConfig,
        mockSite,
        localArtifact,
        remoteArtifact,
        {},
        mockDependencies,
      );
      expect(strategy.verify).toHaveBeenCalledWith(
        mockConfig,
        mockSite,
        localArtifact,
        remoteArtifact,
        mockDependencies,
      );
    });
  });

  describe('verify always runs after upsert', () => {
    test('calls verify after successful upsert to re-fetch and validate', async () => {
      const localArtifact: LocalArtifact<TestLocalData> = {
        id: 'test-key',
        normalizedContent: '{"value":"test"}',
        contentHash: 'hash-123',
        data: {value: 'test'},
      };

      const remoteArtifact: RemoteArtifact<TestRemoteData> = {
        id: 'remote-id',
        name: 'test-key',
        data: {remoteValue: 'existing'},
      };

      const strategy = createMockStrategy(localArtifact, remoteArtifact);
      let upsertCalled = false;
      let verifyCalled = false;

      vi.mocked(strategy.upsert).mockImplementation(async () => {
        await Promise.resolve();
        upsertCalled = true;
        expect(verifyCalled).toBe(false); // verify should be called after
        return remoteArtifact;
      });

      vi.mocked(strategy.verify).mockImplementation(async () => {
        await Promise.resolve();
        verifyCalled = true;
        expect(upsertCalled).toBe(true); // upsert should have been called first
      });

      await syncArtifact(mockConfig, mockSite, strategy, {createMissing: true, checkOnly: false});

      expect(upsertCalled).toBe(true);
      expect(verifyCalled).toBe(true);
    });
  });
});
