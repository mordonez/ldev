import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/http/auth.js';
import type {LiferayApiClient} from '../../core/http/client.js';
import {runLiferayInventorySitesIncludingGlobal} from './liferay-inventory-sites.js';
import {runLiferayInventoryTemplates, type LiferayInventoryTemplate} from './liferay-inventory-templates.js';
import {resolveTemplatesBaseDir, resolveRepoPath, resolveSiteToken} from './liferay-resource-paths.js';
import {resolveResourceSite} from './liferay-resource-shared.js';
import {normalizeLiferayTemplateScript} from './liferay-resource-template-normalize.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceExportTemplatesSiteResult = {
  site: string;
  siteToken: string;
  outputDir: string;
  exported: number;
  failed: number;
};

export type LiferayResourceExportTemplatesResult = {
  mode: 'single-site' | 'all-sites';
  scannedSites: number;
  exported: number;
  failed: number;
  outputDir: string;
  siteResults: LiferayResourceExportTemplatesSiteResult[];
};

export async function runLiferayResourceExportTemplates(
  config: AppConfig,
  options?: {site?: string; dir?: string; allSites?: boolean; continueOnError?: boolean},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceExportTemplatesResult> {
  const baseDir = resolveTemplatesOutputBaseDir(config, options?.dir);

  if (options?.allSites) {
    const sites = await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies);
    const siteResults: LiferayResourceExportTemplatesSiteResult[] = [];
    let exported = 0;
    let failed = 0;

    for (const site of sites) {
      const result = await exportTemplatesForSite(
        config,
        site.siteFriendlyUrl,
        baseDir,
        Boolean(options?.continueOnError),
        dependencies,
      );
      siteResults.push(result);
      exported += result.exported;
      failed += result.failed;
    }

    return {
      mode: 'all-sites',
      scannedSites: siteResults.length,
      exported,
      failed,
      outputDir: baseDir,
      siteResults,
    };
  }

  const result = await exportTemplatesForSite(
    config,
    options?.site ?? '/global',
    baseDir,
    Boolean(options?.continueOnError),
    dependencies,
  );

  return {
    mode: 'single-site',
    scannedSites: 1,
    exported: result.exported,
    failed: result.failed,
    outputDir: baseDir,
    siteResults: [result],
  };
}

export function formatLiferayResourceExportTemplates(result: LiferayResourceExportTemplatesResult): string {
  if (result.mode === 'all-sites') {
    return `EXPORTED mode=all-sites scanned=${result.scannedSites} exported=${result.exported} failed=${result.failed} dir=${result.outputDir}`;
  }

  const site = result.siteResults[0];
  if (!site) {
    return `EXPORTED exported=0 failed=${result.failed} dir=${result.outputDir}`;
  }

  return `EXPORTED site=${site.site} exported=${site.exported} failed=${site.failed} dir=${site.outputDir}`;
}

export function getLiferayResourceExportTemplatesExitCode(result: LiferayResourceExportTemplatesResult): number {
  return result.failed > 0 ? 1 : 0;
}

async function exportTemplatesForSite(
  config: AppConfig,
  siteFriendlyUrl: string,
  baseDir: string,
  continueOnError: boolean,
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceExportTemplatesSiteResult> {
  const site = await resolveResourceSite(config, siteFriendlyUrl, dependencies);
  const siteToken = resolveSiteToken(site.friendlyUrlPath);
  const outputDir = path.join(baseDir, siteToken);
  const templates = await runLiferayInventoryTemplates(config, {site: site.friendlyUrlPath}, dependencies);
  let exported = 0;
  let failed = 0;

  for (const template of templates) {
    try {
      const script = normalizeLiferayTemplateScript(String(template.templateScript ?? ''));

      if (script.trim() === '') {
        throw new CliError('templateScript vacio', {code: 'LIFERAY_RESOURCE_ERROR'});
      }

      const outputName = `${sanitizeFileToken(resolveTemplateExportName(template))}.ftl`;
      const filePath = path.join(outputDir, outputName);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, script);
      exported += 1;
    } catch (error) {
      failed += 1;
      if (!continueOnError) {
        throw error;
      }
    }
  }

  if (exported === 0 && failed === 0 && (await fs.pathExists(outputDir))) {
    await fs.remove(outputDir);
  }

  return {
    site: site.friendlyUrlPath,
    siteToken,
    outputDir,
    exported,
    failed,
  };
}

function resolveTemplatesOutputBaseDir(config: AppConfig, dir: string | undefined): string {
  if ((dir ?? '').trim() !== '') {
    return path.resolve(resolveRepoPath(config, dir ?? ''));
  }

  return resolveTemplatesBaseDir(config);
}

function resolveTemplateExportName(template: LiferayInventoryTemplate): string {
  if (template.externalReferenceCode.trim() !== '') {
    return template.externalReferenceCode;
  }
  if (template.id.trim() !== '') {
    return template.id;
  }
  if (template.name.trim() !== '') {
    return template.name;
  }
  return 'template';
}

function sanitizeFileToken(value: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[^A-Za-z0-9_.-]+/g, '_')
    .replaceAll(/_+/g, '_');
  return normalized === '' ? 'unnamed' : normalized;
}
