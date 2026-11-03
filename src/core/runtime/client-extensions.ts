/**
 * Client extensions in a Liferay workspace and their runtime state.
 *
 * Verified on DXP 2026.q3: a CX zip dropped in deploy/ lands in osgi/modules/
 * and runs as an OSGi bundle whose symbolic name is the project name without
 * separators (`ldev-test-css` -> `ldevtestcss`). Batch CXs log one outcome per
 * `/META-INF/batch/*.batch-engine-data.json`, while the bundle stays Active even
 * when the import fails.
 */

import path from 'node:path';

import fs from 'fs-extra';
import YAML from 'yaml';

import type {AppConfig} from '../config/load-config.js';
import {runGogoCommand} from './gogo-command.js';

export type ClientExtensionEntry = {id: string; type: string; name: string | null};

export type WorkspaceClientExtension = {
  project: string;
  dir: string;
  bundleSymbolicName: string;
  entries: ClientExtensionEntry[];
  /** Paths relative to the project, e.g. `batch/picklists.batch-engine-data.json`. */
  batchFiles: string[];
};

export type BundleState = {id: number; state: string; symbolicName: string; version: string | null};

export type ClientExtensionLogEvent = {
  timestamp: string | null;
  bundle: string;
  kind: 'started' | 'batch-ok' | 'batch-failed' | 'error';
  file: string | null;
  message: string;
};

export function toBundleSymbolicName(project: string): string {
  return project.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

export function clientExtensionsDir(liferayDir: string): string {
  return path.join(liferayDir, 'client-extensions');
}

export async function listWorkspaceClientExtensions(liferayDir: string): Promise<WorkspaceClientExtension[]> {
  const root = clientExtensionsDir(liferayDir);
  if (!(await fs.pathExists(root))) {
    return [];
  }

  const result: WorkspaceClientExtension[] = [];
  for (const entry of (await fs.readdir(root, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    const yamlFile = path.join(root, entry.name, 'client-extension.yaml');
    if (entry.isDirectory() && (await fs.pathExists(yamlFile))) {
      result.push(await readWorkspaceClientExtension(path.join(root, entry.name)));
    }
  }
  return result;
}

export async function readWorkspaceClientExtension(dir: string): Promise<WorkspaceClientExtension> {
  const project = path.basename(dir);
  const parsed: unknown = YAML.parse(await fs.readFile(path.join(dir, 'client-extension.yaml'), 'utf8'));
  const entries: ClientExtensionEntry[] = [];
  if (parsed && typeof parsed === 'object') {
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (id === 'assemble' || !value || typeof value !== 'object') {
        continue;
      }
      const record = value as Record<string, unknown>;
      if (typeof record.type === 'string') {
        entries.push({id, type: record.type, name: typeof record.name === 'string' ? record.name : null});
      }
    }
  }

  const batchDir = path.join(dir, 'batch');
  const batchFiles = (await fs.pathExists(batchDir))
    ? (await fs.readdir(batchDir))
        .filter((file) => file.endsWith('.batch-engine-data.json'))
        .sort()
        .map((file) => path.join('batch', file))
    : [];

  return {project, dir, bundleSymbolicName: toBundleSymbolicName(project), entries, batchFiles};
}

/** `lb -s` lines: `1554|Active     |   15|ldevtestcss (7.4.13)|7.4.13`. */
export function parseBundleStates(output: string): Map<string, BundleState> {
  const states = new Map<string, BundleState>();
  for (const line of output.split(/\r?\n/)) {
    const parts = line.split('|').map((part) => part.trim());
    const id = Number(parts[0]);
    if (parts.length < 4 || !Number.isInteger(id)) {
      continue;
    }
    const match = /^(\S+)(?:\s+\(([^)]*)\))?/.exec(parts[3]);
    if (match) {
      states.set(match[1], {id, state: parts[1], symbolicName: match[1], version: match.at(2) ?? null});
    }
  }
  return states;
}

export async function readBundleStates(
  config: AppConfig,
  processEnv?: NodeJS.ProcessEnv,
): Promise<Map<string, BundleState>> {
  try {
    return parseBundleStates(await runGogoCommand(config, 'lb -s', processEnv));
  } catch {
    return new Map();
  }
}

const STARTED = /STARTED (\S+?)_[\w.-]+ \[\d+\]/;
const BATCH_OK = /Successfully deployed batch engine file (\S+?)_[\w.-]+ \[\d+\] \/META-INF\/(\S+)/;
const BATCH_FAILED = /Unable to deploy batch engine file (\S+?)_[\w.-]+ \[\d+\] \/META-INF\/(\S+?): (.*)$/;
const BATCH_UNITS_FAILED = /Unable to process batch engine units of bundle (\S+)/;
const TIMESTAMP = /^(?:\S+\s+\|\s+)?(\d{4}-\d{2}-\d{2} [\d:.]+)/;

/** Client extension lifecycle events in Liferay log lines, for one bundle or all. */
export function parseClientExtensionLogEvents(content: string, bundle?: string): ClientExtensionLogEvent[] {
  const events: ClientExtensionLogEvent[] = [];
  for (const line of content.split(/\r?\n/)) {
    const timestamp = TIMESTAMP.exec(line)?.[1] ?? null;
    let event: ClientExtensionLogEvent | null = null;
    let match: RegExpExecArray | null;
    if ((match = BATCH_FAILED.exec(line))) {
      event = {timestamp, bundle: match[1], kind: 'batch-failed', file: match[2], message: match[3].trim()};
    } else if ((match = BATCH_OK.exec(line))) {
      event = {timestamp, bundle: match[1], kind: 'batch-ok', file: match[2], message: 'batch file imported'};
    } else if ((match = BATCH_UNITS_FAILED.exec(line))) {
      event = {timestamp, bundle: match[1], kind: 'error', file: null, message: 'batch engine units failed'};
    } else if ((match = STARTED.exec(line))) {
      event = {timestamp, bundle: match[1], kind: 'started', file: null, message: 'bundle started'};
    }
    if (event && (!bundle || event.bundle === bundle)) {
      events.push(event);
    }
  }
  return events;
}
