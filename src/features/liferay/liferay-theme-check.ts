import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {LiferayApiClient} from '../../core/http/client.js';
import {createLiferayApiClient} from '../../core/http/client.js';

type ThemeDependencies = {
  apiClient?: LiferayApiClient;
};

export type LiferayThemeCheckResult = {
  ok: boolean;
  themeName: string;
  urls: {
    mainCss: string;
    adminIcons: string;
    themeIcons: string;
  };
  sourceIconsFile: string;
  sourceIconsExists: boolean;
  adminIconCount: number;
  themeIconCount: number;
  sourceIconCount: number;
  missingIcons: string[];
};

export async function runLiferayThemeCheck(
  config: AppConfig,
  options?: {theme?: string},
  dependencies?: ThemeDependencies,
): Promise<LiferayThemeCheckResult> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const themeName = normalizeThemeName(options?.theme);
  const mainCssUrl = `${config.liferay.url}/o/${themeName}/css/main.css`;
  const adminIconsUrl = `${config.liferay.url}/o/admin-theme/images/clay/icons.svg`;
  const themeIconsUrl = `${config.liferay.url}/o/${themeName}/images/clay/icons.svg`;
  const sourceIconsFile = resolveSourceIconsFile(config, themeName);

  await requireHttp200(apiClient, mainCssUrl, config.liferay.timeoutSeconds, `${themeName} main.css`);
  const adminIconsSvg = await fetchText(apiClient, adminIconsUrl, config.liferay.timeoutSeconds, 'admin-theme icons');
  const themeIconsSvg = await fetchText(apiClient, themeIconsUrl, config.liferay.timeoutSeconds, `${themeName} icons`);

  const adminIds = parseIconIds(adminIconsSvg);
  const themeIds = parseIconIds(themeIconsSvg);
  const missingIcons = [...adminIds].filter((id) => !themeIds.has(id));
  const sourceIconsExists = await fs.pathExists(sourceIconsFile);

  if (!sourceIconsExists) {
    throw new CliError(`Falta fichero fuente: ${sourceIconsFile}`, {code: 'LIFERAY_THEME_ERROR'});
  }

  const sourceIconsSvg = await fs.readFile(sourceIconsFile, 'utf8');
  const sourceIds = parseIconIds(sourceIconsSvg);

  return {
    ok: missingIcons.length === 0,
    themeName,
    urls: {
      mainCss: mainCssUrl,
      adminIcons: adminIconsUrl,
      themeIcons: themeIconsUrl,
    },
    sourceIconsFile,
    sourceIconsExists,
    adminIconCount: adminIds.size,
    themeIconCount: themeIds.size,
    sourceIconCount: sourceIds.size,
    missingIcons,
  };
}

export function formatLiferayThemeCheck(result: LiferayThemeCheckResult): string {
  const lines = [
    'THEME_CHECK',
    `theme=${result.themeName}`,
    `ok=${result.ok}`,
    `adminIconCount=${result.adminIconCount}`,
    `themeIconCount=${result.themeIconCount}`,
    `sourceIconCount=${result.sourceIconCount}`,
    `sourceIconsFile=${result.sourceIconsFile}`,
  ];

  if (result.missingIcons.length === 0) {
    lines.push('missingIcons=0');
    return lines.join('\n');
  }

  lines.push(`missingIcons=${result.missingIcons.length}`);
  for (const icon of result.missingIcons) {
    lines.push(`- ${icon}`);
  }

  return lines.join('\n');
}

export function parseIconIds(svg: string): Set<string> {
  const ids = new Set<string>();
  const matcher = /id="([^"]+)"/g;

  for (const match of svg.matchAll(matcher)) {
    const id = match[1]?.trim();
    if (id) {
      ids.add(id);
    }
  }

  return ids;
}

async function fetchText(
  apiClient: LiferayApiClient,
  url: string,
  timeoutSeconds: number,
  label: string,
): Promise<string> {
  const response = await apiClient.get<string>('', url, {timeoutSeconds});
  if (!response.ok) {
    throw new CliError(`${label} failed with status=${response.status}.`, {code: 'LIFERAY_THEME_ERROR'});
  }

  return response.body;
}

async function requireHttp200(
  apiClient: LiferayApiClient,
  url: string,
  timeoutSeconds: number,
  label: string,
): Promise<void> {
  const response = await apiClient.get('', url, {timeoutSeconds});
  if (!response.ok) {
    throw new CliError(`${label} failed with status=${response.status}.`, {code: 'LIFERAY_THEME_ERROR'});
  }
}

function resolveSourceIconsFile(config: AppConfig, themeName: string): string {
  if (!config.repoRoot) {
    throw new CliError('No se pudo resolver repo root para theme check.', {code: 'LIFERAY_THEME_ERROR'});
  }

  return path.join(config.repoRoot, 'liferay', 'themes', themeName, 'src', 'images', 'clay', 'icons.svg');
}

function normalizeThemeName(theme?: string): string {
  const normalized = theme?.trim() ?? '';
  return normalized === '' ? 'custom-theme' : normalized;
}
