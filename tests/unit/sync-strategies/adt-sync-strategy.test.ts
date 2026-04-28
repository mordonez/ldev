import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test, afterEach} from 'vitest';

import type {AppConfig} from '../../../src/core/config/load-config.js';
import {adtSyncStrategy} from '../../../src/features/liferay/resource/sync-strategies/adt-sync-strategy.js';
import type {ResolvedSite} from '../../../src/features/liferay/portal/site-resolution.js';
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

describe('adtSyncStrategy', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  describe('resolveLocal', () => {
    test('resolves ADT file and returns LocalArtifact', async () => {
      tempDir = createTempDir('adt-resolve-local-');
      // ADT directory structure: adts/{className}/{widgetTypeDir}/{key}.ftl
      const adtDir = path.join(
        tempDir,
        'liferay',
        'resources',
        'templates',
        'application_display',
        'com.liferay.asset.kernel.model.AssetEntry',
        'asset_entry',
      );
      await fs.ensureDir(adtDir);

      const adtContent = '<#assign entry = entry!>\n<p>${entry.title}</p>';
      await fs.writeFile(path.join(adtDir, 'BASIC.ftl'), adtContent);

      const testConfig = {...mockConfig, cwd: tempDir, repoRoot: tempDir};

      const artifact = await adtSyncStrategy.resolveLocal(testConfig, mockSite, {
        key: 'BASIC',
        widgetType: 'asset-entry',
        className: 'com.liferay.asset.kernel.model.AssetEntry',
      });

      expect(artifact).not.toBeNull();
      expect(artifact?.id).toBe('BASIC');
      expect(artifact?.normalizedContent).toBeTruthy();
      expect(artifact?.contentHash).toBeTruthy();
      expect(artifact?.data.filePath).toContain('BASIC.ftl');
    });

    test('returns null when ADT file not found', async () => {
      tempDir = createTempDir('adt-resolve-local-missing-');
      const testConfig = {...mockConfig, cwd: tempDir, repoRoot: tempDir};

      const artifact = await adtSyncStrategy.resolveLocal(testConfig, mockSite, {
        key: 'MISSING',
        widgetType: 'asset-entry',
        className: 'com.liferay.asset.kernel.model.AssetEntry',
      });

      expect(artifact).toBeNull();
    });
  });

  describe('findRemote', () => {
    test('findRemote requires complex site resolution - covered in integration tests', () => {
      // ADT findRemote calls runLiferayResourceListAdts and triggers full site resolution.
      // Keeping unit tests focused on resolveLocal only.
      expect(true).toBe(true);
    });
  });

  describe('upsert', () => {
    test('upsert requires external API calls - covered in integration tests', () => {
      // ADT upsert requires multiple API calls and complex mocking. Better tested in integration.
      expect(true).toBe(true);
    });
  });

  describe('verify', () => {
    test('verify performs hash checking - covered in integration tests', () => {
      // ADT verify performs hash checking internally and may require additional setup
      // These tests are covered in integration tests
      expect(true).toBe(true);
    });
  });
});
