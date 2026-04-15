import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../core/config/load-config.js';
import {LiferayErrors} from './errors/index.js';

type ConfigEntry = {
  key: string;
  value: string;
};

export type LiferayConfigGetResult =
  | {
      ok: true;
      type: 'portal-property';
      key: string;
      value: string | null;
      file: string | null;
      candidates: string[];
    }
  | {
      ok: true;
      type: 'osgi-config';
      pid: string;
      file: string;
      values: Record<string, string>;
    };

export type LiferayConfigSetResult =
  | {
      ok: true;
      type: 'portal-property';
      key: string;
      value: string;
      file: string;
    }
  | {
      ok: true;
      type: 'osgi-config';
      pid: string;
      key: string;
      value: string;
      file: string;
    };

export async function runLiferayConfigGet(
  config: AppConfig,
  options: {target: string; key?: string; source?: 'effective' | 'source'},
): Promise<LiferayConfigGetResult> {
  const source = options.source ?? 'effective';
  const configRoots = resolveConfigRoots(config, source);
  const osgiFile = await findOsgiConfigFile(configRoots, options.target);

  if (osgiFile) {
    return {
      ok: true,
      type: 'osgi-config',
      pid: options.target,
      file: osgiFile,
      values: Object.fromEntries((await readKeyValueFile(osgiFile)).map((entry) => [entry.key, entry.value])),
    };
  }

  const portalFiles = await listPortalPropertyFiles(configRoots);
  for (const file of portalFiles) {
    const entries = await readKeyValueFile(file);
    const match = entries.find((entry) => entry.key === options.target);
    if (match) {
      return {
        ok: true,
        type: 'portal-property',
        key: options.target,
        value: match.value,
        file,
        candidates: portalFiles,
      };
    }
  }

  return {
    ok: true,
    type: 'portal-property',
    key: options.target,
    value: null,
    file: null,
    candidates: portalFiles,
  };
}

export async function runLiferayConfigSet(
  config: AppConfig,
  options: {target: string; key?: string; value: string; source?: 'effective' | 'source'},
): Promise<LiferayConfigSetResult> {
  const source = options.source ?? 'source';
  const configRoots = resolveConfigRoots(config, source);

  if (options.key?.trim()) {
    const file = await resolveWritableOsgiConfigFile(configRoots, options.target);
    await upsertKeyValueFile(file, options.key, options.value);
    return {
      ok: true,
      type: 'osgi-config',
      pid: options.target,
      key: options.key,
      value: options.value,
      file,
    };
  }

  const file = await resolveWritablePortalPropertiesFile(configRoots);
  await upsertKeyValueFile(file, options.target, options.value);
  return {
    ok: true,
    type: 'portal-property',
    key: options.target,
    value: options.value,
    file,
  };
}

export function formatLiferayConfigGet(result: LiferayConfigGetResult): string {
  if (result.type === 'osgi-config') {
    return [
      `PID=${result.pid}`,
      `file=${result.file}`,
      ...Object.entries(result.values).map(([key, value]) => `${key}=${value}`),
    ].join('\n');
  }

  return [`key=${result.key}`, `value=${result.value ?? ''}`, `file=${result.file ?? 'not-found'}`].join('\n');
}

export function formatLiferayConfigSet(result: LiferayConfigSetResult): string {
  if (result.type === 'osgi-config') {
    return `updated pid=${result.pid} key=${result.key} file=${result.file}`;
  }

  return `updated key=${result.key} file=${result.file}`;
}

function resolveConfigRoots(config: AppConfig, source: 'effective' | 'source'): string[] {
  if (!config.liferayDir) {
    throw LiferayErrors.configRepoRequired();
  }

  if (source === 'effective') {
    return [
      path.join(config.liferayDir, 'build', 'docker', 'configs', 'dockerenv'),
      path.join(config.liferayDir, 'configs', 'dockerenv'),
    ];
  }

  return [path.join(config.liferayDir, 'configs', 'dockerenv'), path.join(config.liferayDir, 'configs', 'common')];
}

async function listPortalPropertyFiles(roots: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of roots) {
    for (const name of ['portal-ext.properties', 'portal-ext.local.properties']) {
      const candidate = path.join(root, name);
      if (await fs.pathExists(candidate)) {
        files.push(candidate);
      }
    }
  }
  return files;
}

async function findOsgiConfigFile(roots: string[], pid: string): Promise<string | null> {
  for (const root of roots) {
    const osgiDir = path.join(root, 'osgi', 'configs');
    for (const ext of ['.config', '.cfg', '.cfg.json']) {
      const candidate = path.join(osgiDir, `${pid}${ext}`);
      if (await fs.pathExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

async function resolveWritableOsgiConfigFile(roots: string[], pid: string): Promise<string> {
  const existing = await findOsgiConfigFile(roots, pid);
  if (existing) {
    return existing;
  }

  const base = roots[0];
  if (!base) {
    throw LiferayErrors.configError('Could not resolve the OSGi configs directory.');
  }

  const file = path.join(base, 'osgi', 'configs', `${pid}.config`);
  await fs.ensureDir(path.dirname(file));
  if (!(await fs.pathExists(file))) {
    await fs.writeFile(file, '');
  }
  return file;
}

async function resolveWritablePortalPropertiesFile(roots: string[]): Promise<string> {
  const existing = (await listPortalPropertyFiles(roots))[0];
  if (existing) {
    return existing;
  }

  const base = roots[0];
  if (!base) {
    throw LiferayErrors.configError('Could not resolve the portal-ext.properties directory.');
  }

  const file = path.join(base, 'portal-ext.local.properties');
  await fs.ensureDir(path.dirname(file));
  if (!(await fs.pathExists(file))) {
    await fs.writeFile(file, '');
  }
  return file;
}

async function readKeyValueFile(file: string): Promise<ConfigEntry[]> {
  const content = await fs.readFile(file, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 0) {
        return {key: line, value: ''};
      }

      return {
        key: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    });
}

async function upsertKeyValueFile(file: string, key: string, value: string): Promise<void> {
  const content = (await fs.pathExists(file)) ? await fs.readFile(file, 'utf8') : '';
  const lines = content === '' ? [] : content.split(/\r?\n/);
  let updated = false;

  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.startsWith(`${key}=`)) {
      return line;
    }

    updated = true;
    return `${key}=${value}`;
  });

  if (!updated) {
    nextLines.push(`${key}=${value}`);
  }

  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, `${nextLines.filter((line) => line !== '').join('\n')}\n`);
}
