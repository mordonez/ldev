/**
 * Static view of a site initializer source: what it declares (pages, menus,
 * display page templates), lint for the silent failures recorded in
 * docs/reference/liferay-site-initializer-gotchas.md, and the zip the portal
 * expects (`site-initializer/` at the root; without it the portal creates an
 * empty site and logs nothing).
 */

import path from 'node:path';

import fs from 'fs-extra';
import JSZip from 'jszip';
import YAML from 'yaml';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {isRecord, textOf} from '../resource/liferay-resource-object-diff.js';

export type SiteInitializerLint = {level: 'error' | 'warning'; file: string; message: string};

export type SiteInitializerPlan = {
  sourceDir: string;
  /** Defaults from a siteInitializer client-extension.yaml next to the source. */
  defaults: {siteExternalReferenceCode: string | null; siteName: string | null};
  pages: {friendlyUrl: string; name: string | null; file: string}[];
  menus: {name: string; itemCount: number}[];
  displayPageTemplates: {key: string; name: string | null}[];
  lint: SiteInitializerLint[];
};

/** `--source` is a client extension name, a client extension dir, or a site-initializer dir. */
export async function resolveSiteInitializerSource(config: AppConfig, source: string): Promise<string> {
  const candidates = [
    config.liferayDir ? path.join(config.liferayDir, 'client-extensions', source, 'site-initializer') : null,
    path.resolve(config.repoRoot ?? config.cwd, source, 'site-initializer'),
    path.resolve(config.repoRoot ?? config.cwd, source),
  ].filter((candidate): candidate is string => candidate !== null);

  for (const candidate of candidates) {
    if ((await fs.pathExists(candidate)) && (await fs.stat(candidate)).isDirectory()) {
      return candidate;
    }
  }
  throw LiferayErrors.resourceFileNotFound(`site initializer ${source} (tried ${candidates.join(', ')})`);
}

export async function buildSiteInitializerPlan(sourceDir: string): Promise<SiteInitializerPlan> {
  const lint: SiteInitializerLint[] = [];
  const readJson = async (file: string): Promise<unknown> => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    } catch (error) {
      lint.push({level: 'error', file: relative(sourceDir, file), message: `invalid JSON: ${String(error)}`});
      return null;
    }
  };

  const pages: SiteInitializerPlan['pages'] = [];
  for (const pageFile of await findFiles(path.join(sourceDir, 'layouts'), 'page.json')) {
    const page = await readJson(pageFile);
    const friendlyUrl = isRecord(page) ? textOf(page.friendlyURL) : '';
    if (friendlyUrl === '') {
      lint.push({level: 'error', file: relative(sourceDir, pageFile), message: 'page.json has no friendlyURL'});
    } else {
      pages.push({friendlyUrl, name: pageName(page), file: relative(sourceDir, pageFile)});
    }
  }

  for (const definitionFile of await findFiles(sourceDir, 'page-definition.json')) {
    lintPageDefinition(relative(sourceDir, definitionFile), await readJson(definitionFile), lint);
  }

  const menusFile = path.join(sourceDir, 'site-navigation-menus.json');
  const menusJson = (await fs.pathExists(menusFile)) ? await readJson(menusFile) : [];
  const menus = (Array.isArray(menusJson) ? menusJson : []).filter(isRecord).map((menu) => {
    if ('siteNavigationMenuItems' in menu && !('menuItems' in menu)) {
      lint.push({
        level: 'warning',
        file: 'site-navigation-menus.json',
        message: `menu "${textOf(menu.name)}" uses siteNavigationMenuItems; the portal reads menuItems and creates the menu empty`,
      });
    }
    return {name: textOf(menu.name), itemCount: Array.isArray(menu.menuItems) ? menu.menuItems.length : 0};
  });

  const dptRoot = path.join(sourceDir, 'layout-page-templates', 'display-page-templates');
  const displayPageTemplates: SiteInitializerPlan['displayPageTemplates'] = [];
  if (await fs.pathExists(dptRoot)) {
    for (const key of (await fs.readdir(dptRoot)).sort()) {
      const descriptor = path.join(dptRoot, key, 'display-page-template.json');
      if (await fs.pathExists(descriptor)) {
        const dpt = await readJson(descriptor);
        displayPageTemplates.push({key, name: isRecord(dpt) ? textOf(dpt.name) || null : null});
      }
    }
  }

  if (pages.length === 0 && menus.length === 0 && displayPageTemplates.length === 0) {
    lint.push({
      level: 'warning',
      file: '.',
      message: 'declares no pages, navigation menus or display page templates; is this the site-initializer folder?',
    });
  }

  return {
    sourceDir,
    defaults: await readClientExtensionDefaults(path.dirname(sourceDir)),
    pages,
    menus,
    displayPageTemplates,
    lint,
  };
}

/** Zip the source under a top-level `site-initializer/` folder, as the portal requires. */
export async function zipSiteInitializer(sourceDir: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of await findFiles(sourceDir)) {
    zip.file(`site-initializer/${relative(sourceDir, file)}`, await fs.readFile(file));
  }
  return zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
}

function lintPageDefinition(file: string, definition: unknown, lint: SiteInitializerLint[]): void {
  if (!isRecord(definition)) {
    return;
  }
  if (!isRecord(definition.pageElement) || definition.pageElement.type !== 'Root') {
    lint.push({
      level: 'error',
      file,
      message: 'pageElement.type must be "Root"; otherwise the page is created empty with no error',
    });
  }
  walk(definition, (node) => {
    const items = Number(node.numberOfItems);
    const perPage = Number(node.numberOfItemsPerPage);
    if (Number.isFinite(items) && Number.isFinite(perPage) && items < perPage) {
      lint.push({
        level: 'warning',
        file,
        message: `numberOfItems (${items}) < numberOfItemsPerPage (${perPage}) caps the collection at ${items} item(s)`,
      });
    }
    if (isRecord(node.mapping) && node.mapping.fieldKey === 'Title') {
      lint.push({
        level: 'warning',
        file,
        message: 'fieldKey "Title" is not the reserved title field; use "title" unless Title is a custom field',
      });
    }
  });
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visit);
    }
  } else if (isRecord(value)) {
    visit(value);
    for (const child of Object.values(value)) {
      walk(child, visit);
    }
  }
}

async function readClientExtensionDefaults(cxDir: string): Promise<SiteInitializerPlan['defaults']> {
  const yamlFile = path.join(cxDir, 'client-extension.yaml');
  const none = {siteExternalReferenceCode: null, siteName: null};
  if (!(await fs.pathExists(yamlFile))) {
    return none;
  }
  const parsed: unknown = YAML.parse(await fs.readFile(yamlFile, 'utf8'));
  const entry = isRecord(parsed)
    ? Object.values(parsed).find((value) => isRecord(value) && value.type === 'siteInitializer')
    : undefined;
  return isRecord(entry)
    ? {
        siteExternalReferenceCode: textOf(entry.siteExternalReferenceCode) || null,
        siteName: textOf(entry.siteName) || null,
      }
    : none;
}

function pageName(page: unknown): string | null {
  if (!isRecord(page)) {
    return null;
  }
  const i18n = isRecord(page.name_i18n) ? Object.values(page.name_i18n).map(textOf) : [];
  return textOf(page.name) || i18n.find((name) => name !== '') || null;
}

async function findFiles(dir: string, name?: string): Promise<string[]> {
  if (!(await fs.pathExists(dir))) {
    return [];
  }
  const files: string[] = [];
  for (const entry of (await fs.readdir(dir, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(full, name)));
    } else if (!name || entry.name === name) {
      files.push(full);
    }
  }
  return files;
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}
