import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';

import {resolveEnvContext} from '../env/env-shared.js';

export type DbQueryResult = {
  ok: true;
  query: string;
  file: string | null;
  output: string;
  rows: Array<Record<string, string>>;
  rowCount: number;
};

export async function runDbQuery(
  config: AppConfig,
  options?: {query?: string; file?: string; processEnv?: NodeJS.ProcessEnv},
): Promise<DbQueryResult> {
  const context = resolveEnvContext(config);
  const query = await resolveQuery(options);
  const dbUser = context.envValues.LIFERAY_DB_USERNAME || context.envValues.POSTGRES_USER || 'liferay';
  const dbName = context.envValues.LIFERAY_DB_NAME || context.envValues.POSTGRES_DB || 'liferay';

  const result = await runDockerComposeOrThrow(
    context.dockerDir,
    ['exec', '-T', 'postgres', 'psql', '-U', dbUser, '-d', dbName, '-P', 'pager=off', '-c', query],
    {
      env: options?.processEnv,
    },
  );

  return {
    ok: true,
    query,
    file: options?.file ?? null,
    output: result.stdout.trim(),
    ...parsePsqlOutput(result.stdout.trim()),
  };
}

export function formatDbQuery(result: DbQueryResult): string {
  return result.output;
}

async function resolveQuery(options?: {query?: string; file?: string}): Promise<string> {
  const inline = options?.query?.trim() ?? '';
  if (inline !== '') {
    return inline;
  }

  const file = options?.file?.trim() ?? '';
  if (file === '') {
    throw new CliError('db query requires inline SQL or --file.', {code: 'DB_QUERY_REQUIRED'});
  }

  if (!(await fs.pathExists(file))) {
    throw new CliError(`SQL file does not exist: ${file}`, {code: 'DB_QUERY_FILE_NOT_FOUND'});
  }

  const content = await fs.readFile(file, 'utf8');
  if (content.trim() === '') {
    throw new CliError(`SQL file is empty: ${file}`, {code: 'DB_QUERY_REQUIRED'});
  }

  return content;
}

function parsePsqlOutput(output: string): {rows: Array<Record<string, string>>; rowCount: number} {
  const lines = output.split(/\r?\n/).map((line) => line.replace(/\s+$/, ''));

  const footerLine = [...lines].reverse().find((line) => /^\(\d+\s+row(s)?\)$/.test(line.trim()));
  const rowCount = footerLine ? Number.parseInt(footerLine.replace(/[^\d]/g, ''), 10) || 0 : 0;
  const separatorIndex = lines.findIndex((line) => /^[-+\s]+$/.test(line) && line.includes('-'));
  if (separatorIndex <= 0) {
    return {rows: [], rowCount};
  }

  const headerLine = lines[separatorIndex - 1] ?? '';
  const dataLines = lines
    .slice(separatorIndex + 1)
    .filter((line) => line.trim() !== '' && !/^\(\d+\s+row(s)?\)$/.test(line.trim()));

  const columns = splitPsqlLine(headerLine);
  if (columns.length === 0) {
    return {rows: [], rowCount};
  }

  const rows = dataLines.map((line) => {
    const values = splitPsqlLine(line);
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
  });

  return {rows, rowCount: rowCount || rows.length};
}

function splitPsqlLine(line: string): string[] {
  if (line.includes('|')) {
    return line.split('|').map((part) => part.trim());
  }

  const trimmed = line.trim();
  return trimmed === '' ? [] : [trimmed];
}
