import fs from 'node:fs';
import path from 'node:path';

import fse from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {resolveProjectContext} from '../../core/config/project-context.js';

export type KnownFeatureFlag = {
  id: string;
  name: string;
  description: string;
  minVersion?: string;
  type: 'beta' | 'dev' | 'release';
};

export type FeatureFlagEntry = {
  id: string;
  key: string;
  enabled: boolean | null;
  source: 'properties-file' | 'not-configured';
  name?: string;
  description?: string;
  minVersion?: string;
  type?: string;
};

export type FeatureFlagsListResult = {
  ok: true;
  propertiesFile: string | null;
  flags: FeatureFlagEntry[];
};

export type FeatureFlagToggleResult = {
  ok: true;
  id: string;
  key: string;
  enabled: boolean;
  propertiesFile: string;
  created: boolean;
};

// Curated list of commonly needed feature flags.
// Add new flags here as Liferay ships them.
export const KNOWN_FEATURE_FLAGS: KnownFeatureFlag[] = [
  {
    id: 'LPD-63311',
    name: 'Liferay MCP Server',
    description: 'Enables the Model Context Protocol (MCP) server at /o/mcp/sse for AI tool integrations.',
    minVersion: '2025.Q4',
    type: 'beta',
  },
  {
    id: 'LPS-178664',
    name: 'Remote Apps (Client Extensions)',
    description: 'Enables the Remote Apps / Client Extensions framework.',
    minVersion: '7.4',
    type: 'release',
  },
  {
    id: 'LPS-167698',
    name: 'Commerce Order Importer',
    description: 'Enables the Commerce Order Importer feature.',
    minVersion: '2023.Q4',
    type: 'beta',
  },
];

export function featureFlagKey(id: string): string {
  return `feature.flag.${id}`;
}

export function runFeatureFlagsList(config: AppConfig): FeatureFlagsListResult {
  const propertiesFile = resolvePropertiesFile(config);
  const currentValues = propertiesFile && fs.existsSync(propertiesFile) ? readFeatureFlags(propertiesFile) : {};

  // Build entries from the curated list, annotated with current file state.
  const knownEntries: FeatureFlagEntry[] = KNOWN_FEATURE_FLAGS.map((flag) => {
    const key = featureFlagKey(flag.id);
    const hasRawValue = Object.prototype.hasOwnProperty.call(currentValues, key);
    const rawValue = hasRawValue ? currentValues[key] : undefined;
    return {
      id: flag.id,
      key,
      enabled: hasRawValue ? rawValue === 'true' : null,
      source: hasRawValue ? 'properties-file' : 'not-configured',
      name: flag.name,
      description: flag.description,
      minVersion: flag.minVersion,
      type: flag.type,
    };
  });

  // Also include any feature.flag.* entries from the properties file that are not in the curated list.
  const knownIds = new Set(KNOWN_FEATURE_FLAGS.map((f) => f.id));
  const extraEntries: FeatureFlagEntry[] = Object.entries(currentValues)
    .filter(([key]) => key.startsWith('feature.flag.'))
    .flatMap(([key, value]) => {
      const id = key.replace('feature.flag.', '');
      if (knownIds.has(id)) {
        return [];
      }

      const entry: FeatureFlagEntry = {
        id,
        key,
        enabled: value === 'true',
        source: 'properties-file',
      };
      return [entry];
    });

  return {
    ok: true,
    propertiesFile: propertiesFile ?? null,
    flags: [...knownEntries, ...extraEntries],
  };
}

export async function runFeatureFlagEnable(config: AppConfig, id: string): Promise<FeatureFlagToggleResult> {
  return setFeatureFlag(config, id, true);
}

export async function runFeatureFlagDisable(config: AppConfig, id: string): Promise<FeatureFlagToggleResult> {
  return setFeatureFlag(config, id, false);
}

export function formatFeatureFlagsList(result: FeatureFlagsListResult): string {
  const lines: string[] = [];

  if (result.propertiesFile) {
    lines.push(`Properties file: ${result.propertiesFile}`);
  } else {
    lines.push('Properties file: not found (will be created on first enable)');
  }

  lines.push('');
  lines.push('Feature flags:');

  for (const flag of result.flags) {
    const statusMark = flag.enabled === true ? '[ON] ' : flag.enabled === false ? '[OFF]' : '[ - ]';
    const nameLabel = flag.name ? ` ${flag.name}` : '';
    lines.push(`${statusMark} ${flag.id}${nameLabel}`);
    if (flag.description) {
      lines.push(`       ${flag.description}`);
    }

    if (flag.minVersion) {
      lines.push(`       Requires: ${flag.minVersion}+`);
    }
  }

  lines.push('');
  lines.push('Use `ldev feature-flags enable <ID>` to add a flag to the properties file.');
  lines.push('Restart the portal for changes to take effect.');

  return lines.join('\n');
}

export function formatFeatureFlagToggle(result: FeatureFlagToggleResult): string {
  const lines = [
    `Feature flag ${result.enabled ? 'enabled' : 'disabled'}: ${result.id}`,
    `Key: ${result.key}`,
    `Properties file: ${result.propertiesFile}${result.created ? ' (created)' : ''}`,
    '',
  ];

  // blade-workspace: blade only syncs configs/local/ to the bundle during init, not on start.
  // The user must restart; blade will not re-copy automatically.
  if (result.propertiesFile.includes(`configs${path.sep}local`)) {
    lines.push('Restart the portal for this change to take effect.');
    lines.push('Note: if the portal is already initialized, also copy configs/local/portal-ext.properties');
    lines.push('      to bundles/portal-ext.properties before restarting.');
  } else {
    lines.push('Restart the portal for this change to take effect.');
  }

  return lines.join('\n');
}

async function setFeatureFlag(config: AppConfig, id: string, enabled: boolean): Promise<FeatureFlagToggleResult> {
  const propertiesFile = resolvePropertiesFile(config);

  if (!propertiesFile) {
    throw new CliError(
      'Cannot determine the portal-ext.properties path for this project. Ensure the project root is detected correctly.',
      {code: 'FEATURE_FLAG_NO_PROPERTIES_PATH'},
    );
  }

  const key = featureFlagKey(id);
  const created = !(await fse.pathExists(propertiesFile));

  await fse.ensureDir(path.dirname(propertiesFile));

  const existing = created ? '' : await fse.readFile(propertiesFile, 'utf8');
  const updated = upsertProperty(existing, key, String(enabled));
  await fse.writeFile(propertiesFile, updated);

  return {
    ok: true,
    id,
    key,
    enabled,
    propertiesFile,
    created,
  };
}

function resolvePropertiesFile(config: AppConfig): string | null {
  if (!config.repoRoot) {
    return null;
  }

  const project = resolveProjectContext({cwd: config.cwd});

  if (project.projectType === 'blade-workspace') {
    return path.join(config.repoRoot, 'configs', 'local', 'portal-ext.properties');
  }

  // ldev-native: liferay/configs/dockerenv/portal-ext.properties
  if (config.liferayDir) {
    return path.join(config.liferayDir, 'configs', 'dockerenv', 'portal-ext.properties');
  }

  return null;
}

function readFeatureFlags(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf8');
  const result: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

function upsertProperty(content: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*#?\\s*${escapedKey}\\s*=`);
  const newLine = `${key}=${value}`;

  const matchIndex = lines.findIndex((line) => pattern.test(line));
  if (matchIndex === -1) {
    // Add at the end with a blank line separator if file is non-empty.
    const trimmed = content.trimEnd();
    return trimmed.length > 0 ? `${trimmed}\n${newLine}\n` : `${newLine}\n`;
  }

  const updated = [...lines];
  updated[matchIndex] = newLine;

  return updated.join('\n');
}
