/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */

import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test, vi, afterEach, beforeEach} from 'vitest';

import type {AppConfig} from '../../../src/core/config/load-config.js';
import type {HttpApiClient} from '../../../src/core/http/client.js';
import {structureSyncStrategy} from '../../../src/features/liferay/resource/sync-strategies/structure-sync-strategy.js';
import type {ResolvedSite} from '../../../src/features/liferay/inventory/liferay-site-resolver.js';
import {createTempDir} from '../../../src/testing/temp-repo.js';

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

describe('structureSyncStrategy', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = '';
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  describe('resolveLocal', () => {
    test('resolves structure file and returns LocalArtifact', async () => {
      tempDir = createTempDir('structure-resolve-local-');
      const structureDir = path.join(tempDir, 'liferay', 'resources', 'journal', 'structures');
      await fs.ensureDir(structureDir);

      const structurePayload = {
        dataDefinitionFields: [
          {name: 'field1', type: 'text'},
          {name: 'field2', type: 'textarea'},
        ],
      };

      await fs.writeJson(path.join(structureDir, 'BASIC.json'), structurePayload);

      const testConfig = {...mockConfig, cwd: tempDir, repoRoot: tempDir};

      const artifact = await structureSyncStrategy.resolveLocal(testConfig, mockSite, {
        key: 'BASIC',
      });

      expect(artifact).not.toBeNull();
      expect(artifact?.id).toBe('BASIC');
      expect(artifact?.normalizedContent).toBeTruthy();
      expect(artifact?.contentHash).toBeTruthy();
      expect(artifact?.data.filePath).toContain('BASIC.json');
    });

    test('returns null when structure file not found', async () => {
      tempDir = createTempDir('structure-resolve-local-missing-');
      const testConfig = {...mockConfig, cwd: tempDir, repoRoot: tempDir};

      const artifact = await structureSyncStrategy.resolveLocal(testConfig, mockSite, {
        key: 'MISSING',
      });

      expect(artifact).toBeNull();
    });

    test('throws on invalid JSON file', async () => {
      tempDir = createTempDir('structure-resolve-local-invalid-json-');
      const structureDir = path.join(tempDir, 'liferay', 'resources', 'journal', 'structures');
      await fs.ensureDir(structureDir);

      await fs.writeFile(path.join(structureDir, 'BAD.json'), 'not valid json {');

      const testConfig = {...mockConfig, cwd: tempDir, repoRoot: tempDir};

      await expect(structureSyncStrategy.resolveLocal(testConfig, mockSite, {key: 'BAD'})).rejects.toThrow();
    });
  });

  describe('findRemote', () => {
    test('returns null when remote structure not found', async () => {
      const localArtifact = {
        id: 'BASIC',
        normalizedContent: '{"dataDefinitionFields":[]}',
        contentHash: 'hash-123',
        data: {filePath: '/path/to/structure.json'},
      };

      const mockDependencies = {
        apiClient: {
          get: vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            data: null,
            headers: new Headers(),
            body: '{"error":"Not found"}',
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

      const result = await structureSyncStrategy.findRemote(
        mockConfig,
        mockSite,
        localArtifact,
        {key: 'BASIC'},
        mockDependencies,
      );

      expect(result).toBeNull();
    });

    test('returns remote artifact when found', async () => {
      const localArtifact = {
        id: 'BASIC',
        normalizedContent: '{"dataDefinitionFields":[]}',
        contentHash: 'hash-123',
        data: {filePath: '/path/to/structure.json'},
      };

      const remoteStructure = {
        id: 'struct-123',
        dataDefinitionKey: 'BASIC',
        dataDefinitionFields: [{name: 'field1', type: 'text'}],
      };

      const mockDependencies = {
        apiClient: {
          get: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            data: remoteStructure,
            headers: new Headers(),
            body: JSON.stringify(remoteStructure),
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

      const result = await structureSyncStrategy.findRemote(
        mockConfig,
        mockSite,
        localArtifact,
        {key: 'BASIC'},
        mockDependencies,
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('struct-123');
      expect(result?.name).toBe('BASIC');
    });
  });

  describe('upsert', () => {
    test('creates new structure when remote is null', async () => {
      tempDir = createTempDir('structure-upsert-create-');
      const structureDir = path.join(tempDir, 'liferay', 'resources', 'journal', 'structures');
      await fs.ensureDir(structureDir);

      const structurePayload = {
        dataDefinitionFields: [{name: 'field1', type: 'text'}],
      };

      await fs.writeJson(path.join(structureDir, 'NEW.json'), structurePayload);

      const testConfig = {...mockConfig, cwd: tempDir, repoRoot: tempDir};

      const localArtifact = {
        id: 'NEW',
        normalizedContent: JSON.stringify(structurePayload),
        contentHash: 'hash-new',
        data: {filePath: path.join(structureDir, 'NEW.json')},
      };

      const mockDependencies = {
        apiClient: {
          get: vi.fn(),
          postJson: vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            data: {id: 'struct-999', dataDefinitionKey: 'NEW'},
            headers: new Headers(),
            body: '{"id":"struct-999"}',
          }),
        } as any,
        tokenClient: {
          fetchClientCredentialsToken: vi.fn().mockResolvedValue({
            accessToken: 'token',
            tokenType: 'Bearer',
            expiresIn: 3600,
          }),
        } as any,
        sleep: vi.fn().mockResolvedValue(undefined),
      };

      const result = await structureSyncStrategy.upsert(
        testConfig,
        mockSite,
        localArtifact,
        null,
        {key: 'NEW', createMissing: true},
        mockDependencies,
      );

      expect(result.id).toBe('struct-999');
      expect(result.name).toBe('NEW');
    });

    test('throws error when fields are removed without migration plan', async () => {
      tempDir = createTempDir('structure-upsert-breaking-change-');
      const structureDir = path.join(tempDir, 'liferay', 'resources', 'journal', 'structures');
      await fs.ensureDir(structureDir);

      const structurePayload = {
        dataDefinitionFields: [{name: 'field1', type: 'text'}],
      };

      await fs.writeJson(path.join(structureDir, 'EXISTING.json'), structurePayload);

      const testConfig = {...mockConfig, cwd: tempDir, repoRoot: tempDir};

      const localArtifact = {
        id: 'EXISTING',
        normalizedContent: JSON.stringify(structurePayload),
        contentHash: 'hash-update',
        data: {filePath: path.join(structureDir, 'EXISTING.json')},
      };

      const remoteArtifact = {
        id: 'struct-100',
        name: 'EXISTING',
        data: {
          structureId: 'struct-100',
          runtimeDefinition: {
            dataDefinitionFields: [
              {name: 'field1', type: 'text'},
              {name: 'field2', type: 'textarea'},
            ],
          },
          existingFieldRefs: new Set(['field1', 'field2']),
          removedFieldReferences: [],
          recoveredAfterTimeout: false,
        },
      };

      const mockDependencies = {
        apiClient: {
          get: vi.fn(),
        } as any,
        tokenClient: {
          fetchClientCredentialsToken: vi.fn().mockResolvedValue({
            accessToken: 'token',
            tokenType: 'Bearer',
            expiresIn: 3600,
          }),
        } as any,
      };

      // The structure strategy throws a breaking change error when fields are removed without migration plan
      await expect(
        structureSyncStrategy.upsert(
          testConfig,
          mockSite,
          localArtifact,
          remoteArtifact,
          {key: 'EXISTING'},
          mockDependencies,
        ),
      ).rejects.toThrow('Blocked change');
    });

    test('allows breaking change when --allow-breaking-change is set', async () => {
      tempDir = createTempDir('structure-upsert-allow-breaking-change-');
      const structureDir = path.join(tempDir, 'liferay', 'resources', 'journal', 'structures');
      await fs.ensureDir(structureDir);

      const structurePayload = {
        dataDefinitionFields: [{name: 'field1', type: 'text'}],
      };

      await fs.writeJson(path.join(structureDir, 'EXISTING.json'), structurePayload);

      const testConfig = {...mockConfig, cwd: tempDir, repoRoot: tempDir};

      const localArtifact = {
        id: 'EXISTING',
        normalizedContent: JSON.stringify(structurePayload),
        contentHash: 'hash-update',
        data: {filePath: path.join(structureDir, 'EXISTING.json')},
      };

      const remoteArtifact = {
        id: 'struct-100',
        name: 'EXISTING',
        data: {
          structureId: 'struct-100',
          runtimeDefinition: {
            dataDefinitionFields: [
              {name: 'field1', type: 'text'},
              {name: 'field2', type: 'textarea'},
            ],
          },
          existingFieldRefs: new Set(['field1', 'field2']),
          removedFieldReferences: [],
          recoveredAfterTimeout: false,
        },
      };

      const mockDependencies = {
        apiClient: {
          get: vi.fn(),
          putJson: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            data: {id: 'struct-100'},
            headers: new Headers(),
            body: '{"id":"struct-100"}',
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

      // Should not throw
      const result = await structureSyncStrategy.upsert(
        testConfig,
        mockSite,
        localArtifact,
        remoteArtifact,
        {key: 'EXISTING', allowBreakingChange: true},
        mockDependencies,
      );

      expect(result.id).toBe('struct-100');
    });
  });

  describe('verify', () => {
    test('succeeds when structures match', async () => {
      const localArtifact = {
        id: 'BASIC',
        normalizedContent: '{"dataDefinitionFields":[{"name":"field1"}]}',
        contentHash: 'hash-123',
        data: {filePath: '/path/to/structure.json'},
      };

      const remoteArtifact = {
        id: 'struct-100',
        name: 'BASIC',
        data: {
          structureId: 'struct-100',
          runtimeDefinition: {dataDefinitionFields: [{name: 'field1'}]},
          existingFieldRefs: new Set(['field1']),
          removedFieldReferences: [],
          recoveredAfterTimeout: false,
        },
      };

      // Verify should not throw
      await expect(
        structureSyncStrategy.verify(mockConfig, mockSite, localArtifact, remoteArtifact),
      ).resolves.not.toThrow();
    });
  });
});
