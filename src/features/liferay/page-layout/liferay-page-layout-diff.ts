import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../../cli/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {runLiferayPageLayoutExport, type LiferayPageLayoutExport} from './liferay-page-layout-export.js';

const DIFF_KIND = 'liferay-page-layout-diff';
const EXPORT_KIND = 'liferay-page-layout-export';
const MAX_DIFFS = 50;

type PageLayoutDiffDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
  now?: () => Date;
};

export type LiferayPageLayoutDiffEntry = {
  compareMode: 'pageDefinition';
  path: string;
  left: string;
  right: string;
};

export type LiferayPageLayoutDiff = {
  kind: typeof DIFF_KIND;
  leftUrl: string;
  rightUrl?: string;
  referenceFile?: string;
  compareMode: 'pageDefinition';
  equal: boolean;
  diffCount: number;
  diffs: LiferayPageLayoutDiffEntry[];
};

export async function runLiferayPageLayoutDiff(
  config: AppConfig,
  options: {url?: string; file?: string; referenceUrl?: string},
  dependencies?: PageLayoutDiffDependencies,
): Promise<LiferayPageLayoutDiff> {
  validateDiffOptions(options);

  const left = await runLiferayPageLayoutExport(config, {url: options.url}, dependencies);

  const right = options.referenceUrl
    ? await runLiferayPageLayoutExport(config, {url: options.referenceUrl}, dependencies)
    : await readLiferayPageLayoutExportFile(options.file ?? '');

  const diffs = collectPageLayoutDiffs(left, right);

  return {
    kind: DIFF_KIND,
    leftUrl: left.source.url,
    ...(options.referenceUrl ? {rightUrl: right.source.url} : {}),
    ...(options.file ? {referenceFile: path.resolve(options.file)} : {}),
    compareMode: 'pageDefinition',
    equal: diffs.length === 0,
    diffCount: diffs.length,
    diffs,
  };
}

export function formatLiferayPageLayoutDiff(result: LiferayPageLayoutDiff): string {
  const lines = [
    'PAGE LAYOUT DIFF',
    `compareMode=${result.compareMode}`,
    `equal=${result.equal}`,
    `diffCount=${result.diffCount}`,
    `leftUrl=${result.leftUrl}`,
  ];

  if (result.rightUrl) {
    lines.push(`rightUrl=${result.rightUrl}`);
  }
  if (result.referenceFile) {
    lines.push(`referenceFile=${result.referenceFile}`);
  }

  for (const diff of result.diffs) {
    lines.push(`- path=${diff.path} left=${diff.left} right=${diff.right}`);
  }

  return lines.join('\n');
}

export async function readLiferayPageLayoutExportFile(filePath: string): Promise<LiferayPageLayoutExport> {
  const resolvedFilePath = path.resolve(filePath);
  const parsed = JSON.parse(await fs.readFile(resolvedFilePath, 'utf8')) as Partial<LiferayPageLayoutExport>;

  if (parsed.kind !== EXPORT_KIND) {
    throw new CliError(`El fichero no parece un export de page layout: ${resolvedFilePath}`, {
      code: 'LIFERAY_PAGE_LAYOUT_ERROR',
    });
  }

  return parsed as LiferayPageLayoutExport;
}

export function collectPageLayoutDiffs(
  left: LiferayPageLayoutExport,
  right: LiferayPageLayoutExport,
): LiferayPageLayoutDiffEntry[] {
  const diffs: LiferayPageLayoutDiffEntry[] = [];
  collectStructuralDiffs(left.headlessSitePage?.pageDefinition, right.headlessSitePage?.pageDefinition, '$', diffs);
  return diffs;
}

function validateDiffOptions(options: {url?: string; file?: string; referenceUrl?: string}): void {
  if (!options.url) {
    throw new CliError('Usa --url para indicar la página base live.', {code: 'LIFERAY_PAGE_LAYOUT_ERROR'});
  }

  const fileProvided = Boolean(options.file);
  const referenceUrlProvided = Boolean(options.referenceUrl);
  if (fileProvided === referenceUrlProvided) {
    throw new CliError('Usa exactamente uno de --file o --reference-url.', {code: 'LIFERAY_PAGE_LAYOUT_ERROR'});
  }
}

function collectStructuralDiffs(
  left: unknown,
  right: unknown,
  currentPath: string,
  diffs: LiferayPageLayoutDiffEntry[],
): void {
  if (diffs.length >= MAX_DIFFS) {
    return;
  }

  if (left === undefined) {
    if (right !== undefined) {
      diffs.push(diffEntry(currentPath, left, right));
    }
    return;
  }

  if (right === undefined) {
    diffs.push(diffEntry(currentPath, left, right));
    return;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      diffs.push(diffEntry(currentPath, left, right));
      return;
    }

    if (left.length !== right.length) {
      diffs.push(diffEntry(joinPath(currentPath, 'length'), left.length, right.length));
      if (diffs.length >= MAX_DIFFS) {
        return;
      }
    }

    const max = Math.max(left.length, right.length);
    for (let index = 0; index < max; index += 1) {
      collectStructuralDiffs(left[index], right[index], `${currentPath}[${index}]`, diffs);
      if (diffs.length >= MAX_DIFFS) {
        return;
      }
    }
    return;
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) {
      diffs.push(diffEntry(currentPath, left, right));
      return;
    }

    const fields = new Set([...Object.keys(left), ...Object.keys(right)].sort());
    for (const field of fields) {
      collectStructuralDiffs(left[field], right[field], joinPath(currentPath, field), diffs);
      if (diffs.length >= MAX_DIFFS) {
        return;
      }
    }
    return;
  }

  if (!Object.is(left, right)) {
    diffs.push(diffEntry(currentPath, left, right));
  }
}

function diffEntry(pathValue: string, left: unknown, right: unknown): LiferayPageLayoutDiffEntry {
  return {
    compareMode: 'pageDefinition',
    path: pathValue,
    left: summarizeValue(left),
    right: summarizeValue(right),
  };
}

function joinPath(current: string, field: string): string {
  return current === '$' ? `$.${field}` : `${current}.${field}`;
}

function summarizeValue(value: unknown): string {
  if (value === undefined) {
    return '<missing>';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  const raw = JSON.stringify(value);
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
