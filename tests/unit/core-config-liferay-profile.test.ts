import {describe, expect, test, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  resolveLiferayProfileFiles,
  readProfileFile,
  writeLocalLiferayProfile,
  LIFERAY_PROFILE_FILE,
  LIFERAY_LOCAL_PROFILE_FILE,
} from '../../src/core/config/liferay-profile.js';

describe('liferay profile configuration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldev-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, {recursive: true});
    }
  });

  describe('resolveLiferayProfileFiles', () => {
    test('returns null files when no repo root', () => {
      const files = resolveLiferayProfileFiles(null);

      expect(files.shared).toBeNull();
      expect(files.local).toBeNull();
    });

    test('returns null when profile files do not exist', () => {
      const files = resolveLiferayProfileFiles(tmpDir);

      expect(files.shared).toBeNull();
      expect(files.local).toBeNull();
    });

    test('returns shared profile path when file exists', () => {
      const profilePath = path.join(tmpDir, LIFERAY_PROFILE_FILE);
      fs.writeFileSync(profilePath, 'liferay:\n  url: http://localhost:8080');

      const files = resolveLiferayProfileFiles(tmpDir);

      expect(files.shared).toBe(profilePath);
    });

    test('returns local profile path when file exists', () => {
      const localPath = path.join(tmpDir, LIFERAY_LOCAL_PROFILE_FILE);
      fs.writeFileSync(localPath, 'liferay:\n  oauth2:\n    clientId: test');

      const files = resolveLiferayProfileFiles(tmpDir);

      expect(files.local).toBe(localPath);
    });

    test('returns both paths when both files exist', () => {
      const profilePath = path.join(tmpDir, LIFERAY_PROFILE_FILE);
      const localPath = path.join(tmpDir, LIFERAY_LOCAL_PROFILE_FILE);

      fs.writeFileSync(profilePath, 'liferay:\n  url: http://localhost:8080');
      fs.writeFileSync(localPath, 'liferay:\n  oauth2:\n    clientId: test');

      const files = resolveLiferayProfileFiles(tmpDir);

      expect(files.shared).toBe(profilePath);
      expect(files.local).toBe(localPath);
    });
  });

  describe('readProfileFile', () => {
    test('returns empty object when file does not exist', () => {
      const nonExistentPath = path.join(tmpDir, 'nonexistent.yml');

      const result = readProfileFile(nonExistentPath);

      expect(result).toEqual({});
    });

    test('parses simple YAML into flat record', () => {
      const profilePath = path.join(tmpDir, 'test-profile.yml');
      fs.writeFileSync(profilePath, 'liferay:\n  url: http://localhost:8080');

      const result = readProfileFile(profilePath);

      expect(result['liferay.url']).toBe('http://localhost:8080');
    });

    test('flattens nested YAML structure', () => {
      const profilePath = path.join(tmpDir, 'test-profile.yml');
      fs.writeFileSync(
        profilePath,
        `liferay:
  url: http://localhost:8080
  oauth2:
    clientId: test-client
    clientSecret: test-secret`,
      );

      const result = readProfileFile(profilePath);

      expect(result['liferay.url']).toBe('http://localhost:8080');
      expect(result['liferay.oauth2.clientId']).toBe('test-client');
      expect(result['liferay.oauth2.clientSecret']).toBe('test-secret');
    });

    test('ignores null and undefined values', () => {
      const profilePath = path.join(tmpDir, 'test-profile.yml');
      fs.writeFileSync(
        profilePath,
        `liferay:
  url: http://localhost:8080
  empty: null`,
      );

      const result = readProfileFile(profilePath);

      expect(result['liferay.url']).toBe('http://localhost:8080');
      expect(result['liferay.empty']).toBeUndefined();
    });
  });

  describe('writeLocalLiferayProfile', () => {
    test('creates new profile file with provided values', () => {
      const profilePath = path.join(tmpDir, LIFERAY_LOCAL_PROFILE_FILE);

      writeLocalLiferayProfile(profilePath, {
        url: 'http://localhost:8080',
        oauth2ClientId: 'client-id',
        oauth2ClientSecret: 'client-secret',
      });

      expect(fs.existsSync(profilePath)).toBe(true);
      const content = fs.readFileSync(profilePath, 'utf8');
      expect(content).toContain('liferay:');
      expect(content).toContain('url: http://localhost:8080');
      expect(content).toContain('clientId: client-id');
      expect(content).toContain('clientSecret: client-secret');
    });

    test('updates existing profile with new values', () => {
      const profilePath = path.join(tmpDir, LIFERAY_LOCAL_PROFILE_FILE);
      fs.writeFileSync(
        profilePath,
        `liferay:
  url: http://old:8080
  oauth2:
    clientId: old-id`,
      );

      writeLocalLiferayProfile(profilePath, {
        url: 'http://new:8080',
        oauth2ClientSecret: 'new-secret',
      });

      const content = fs.readFileSync(profilePath, 'utf8');
      expect(content).toContain('url: http://new:8080');
      expect(content).toContain('clientId: old-id');
      expect(content).toContain('clientSecret: new-secret');
    });

    test('handles scope aliases', () => {
      const profilePath = path.join(tmpDir, LIFERAY_LOCAL_PROFILE_FILE);

      writeLocalLiferayProfile(profilePath, {
        oauth2ScopeAliases: 'scope1,scope2,scope3',
      });

      const content = fs.readFileSync(profilePath, 'utf8');
      expect(content).toContain('scopeAliases: scope1,scope2,scope3');
    });

    test('handles timeout seconds', () => {
      const profilePath = path.join(tmpDir, LIFERAY_LOCAL_PROFILE_FILE);

      writeLocalLiferayProfile(profilePath, {
        oauth2TimeoutSeconds: 60,
      });

      const content = fs.readFileSync(profilePath, 'utf8');
      expect(content).toContain('timeoutSeconds: 60');
    });

    test('preserves undefined values in existing profile', () => {
      const profilePath = path.join(tmpDir, LIFERAY_LOCAL_PROFILE_FILE);
      fs.writeFileSync(
        profilePath,
        `liferay:
  url: http://localhost:8080
  oauth2:
    clientId: existing-id`,
      );

      writeLocalLiferayProfile(profilePath, {
        oauth2ClientSecret: 'new-secret',
      });

      const content = fs.readFileSync(profilePath, 'utf8');
      expect(content).toContain('url: http://localhost:8080');
      expect(content).toContain('clientId: existing-id');
      expect(content).toContain('clientSecret: new-secret');
    });

    test('only writes specified values', () => {
      const profilePath = path.join(tmpDir, LIFERAY_LOCAL_PROFILE_FILE);

      writeLocalLiferayProfile(profilePath, {
        url: 'http://localhost:8080',
      });

      const content = fs.readFileSync(profilePath, 'utf8');
      expect(content).toContain('url: http://localhost:8080');
      expect(content).not.toContain('clientId');
      expect(content).not.toContain('clientSecret');
    });
  });
});
