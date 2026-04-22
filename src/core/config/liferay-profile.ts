import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

export const LIFERAY_PROFILE_FILE = '.liferay-cli.yml';
export const LIFERAY_LOCAL_PROFILE_FILE = '.liferay-cli.local.yml';

export type LiferayProfileFiles = {
  shared: string | null;
  local: string | null;
};

export function resolveLiferayProfileFiles(repoRoot: string | null): LiferayProfileFiles {
  if (!repoRoot) {
    return {
      shared: null,
      local: null,
    };
  }

  const sharedFile = path.join(repoRoot, LIFERAY_PROFILE_FILE);
  const localFile = path.join(repoRoot, LIFERAY_LOCAL_PROFILE_FILE);

  return {
    shared: fs.existsSync(sharedFile) ? sharedFile : null,
    local: fs.existsSync(localFile) ? localFile : null,
  };
}

export function readProfileFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed: unknown = YAML.parse(fs.readFileSync(filePath, 'utf8'));
  const flattened: Record<string, string> = {};
  flatten(parsed, '', flattened);
  return flattened;
}

export function writeLocalLiferayProfile(
  filePath: string,
  values: {
    url?: string;
    oauth2ClientId?: string;
    oauth2ClientSecret?: string;
    oauth2ScopeAliases?: string;
    oauth2TimeoutSeconds?: number;
  },
): void {
  const currentDocument = fs.existsSync(filePath)
    ? YAML.parseDocument(fs.readFileSync(filePath, 'utf8'))
    : new YAML.Document({});
  const rootValue: unknown = currentDocument.toJS() ?? {};
  const root = isRecord(rootValue) ? rootValue : {};
  const liferay = isRecord(root.liferay) ? root.liferay : {};
  const oauth2 = isRecord(liferay.oauth2) ? liferay.oauth2 : {};

  if (values.url !== undefined) {
    liferay.url = values.url;
  }
  if (values.oauth2ClientId !== undefined) {
    oauth2.clientId = values.oauth2ClientId;
  }
  if (values.oauth2ClientSecret !== undefined) {
    oauth2.clientSecret = values.oauth2ClientSecret;
  }
  if (values.oauth2ScopeAliases !== undefined) {
    oauth2.scopeAliases = values.oauth2ScopeAliases;
  }
  if (values.oauth2TimeoutSeconds !== undefined) {
    oauth2.timeoutSeconds = values.oauth2TimeoutSeconds;
  }

  liferay.oauth2 = oauth2;
  root.liferay = liferay;

  currentDocument.contents = currentDocument.createNode(root);
  fs.writeFileSync(filePath, currentDocument.toString(), 'utf8');
}

function flatten(value: unknown, prefix: string, target: Record<string, string>): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextPrefix = prefix === '' ? key : `${prefix}.${key}`;
      flatten(nestedValue, nextPrefix, target);
    }
    return;
  }

  if (typeof value === 'string') {
    target[prefix] = value;
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    target[prefix] = `${value}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
