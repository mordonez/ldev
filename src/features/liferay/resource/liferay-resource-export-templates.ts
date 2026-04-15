import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {LiferayErrors} from '../errors/index.js';
import {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import {runLiferayInventoryTemplates, type LiferayInventoryTemplate} from '../inventory/liferay-inventory-templates.js';
import {listDdmTemplates} from './liferay-resource-shared.js';
import {resolveSiteToken} from './liferay-resource-paths.js';
import {resolveArtifactBaseDir, sanitizeArtifactToken} from './artifact-paths.js';
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
  debug?: {
    headlessCount: number;
    ddmCount: number;
    selectedSource: 'headless' | 'ddm';
  };
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
  options?: {site?: string; dir?: string; allSites?: boolean; continueOnError?: boolean; debug?: boolean},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceExportTemplatesResult> {
  const baseDir = resolveArtifactBaseDir(config, 'template', options?.dir);

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
        Boolean(options?.debug),
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
    Boolean(options?.debug),
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
    const lines = [
      `EXPORTED mode=all-sites scanned=${result.scannedSites} exported=${result.exported} failed=${result.failed} dir=${result.outputDir}`,
    ];
    for (const site of result.siteResults) {
      if (!site.debug) {
        continue;
      }
      lines.push(
        `DEBUG site=${site.site} source=${site.debug.selectedSource} headlessCount=${site.debug.headlessCount}`,
      );
    }
    return lines.join('\n');
  }

  const site = result.siteResults[0];
  if (!site) {
    return `EXPORTED exported=0 failed=${result.failed} dir=${result.outputDir}`;
  }

  const lines = [`EXPORTED site=${site.site} exported=${site.exported} failed=${site.failed} dir=${site.outputDir}`];
  if (site.debug) {
    lines.push(`DEBUG site=${site.site} source=${site.debug.selectedSource} headlessCount=${site.debug.headlessCount}`);
  }
  return lines.join('\n');
}

export function getLiferayResourceExportTemplatesExitCode(result: LiferayResourceExportTemplatesResult): number {
  return result.failed > 0 ? 1 : 0;
}

async function exportTemplatesForSite(
  config: AppConfig,
  siteFriendlyUrl: string,
  baseDir: string,
  continueOnError: boolean,
  debugEnabled: boolean,
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceExportTemplatesSiteResult> {
  const site = await resolveResourceSite(config, siteFriendlyUrl, dependencies);
  const siteToken = resolveSiteToken(site.friendlyUrlPath);
  const outputDir = path.join(baseDir, siteToken);
  const {templates, debug} = await listTemplatesForExport(config, site, dependencies);
  let exported = 0;
  let failed = 0;

  for (const template of templates) {
    try {
      const script = normalizeLiferayTemplateScript(String(template.templateScript ?? ''));

      if (script.trim() === '') {
        throw LiferayErrors.resourceError('templateScript is empty');
      }

      const outputName = `${sanitizeArtifactToken(resolveTemplateExportName(template))}.ftl`;
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
    debug: debugEnabled ? debug : undefined,
  };
}

async function listTemplatesForExport(
  config: AppConfig,
  site: Awaited<ReturnType<typeof resolveResourceSite>>,
  dependencies?: ResourceDependencies,
): Promise<{
  templates: LiferayInventoryTemplate[];
  debug: NonNullable<LiferayResourceExportTemplatesSiteResult['debug']>;
}> {
  const debug: NonNullable<LiferayResourceExportTemplatesSiteResult['debug']> = {
    headlessCount: 0,
    ddmCount: 0,
    selectedSource: 'headless',
  };

  const headlessTemplates = await runLiferayInventoryTemplates(config, {site: site.friendlyUrlPath}, dependencies);
  debug.headlessCount = headlessTemplates.length;

  if (headlessTemplates.length > 0) {
    return {templates: headlessTemplates, debug};
  }

  const ddmTemplates = await listDdmTemplates(config, site, dependencies);
  debug.ddmCount = ddmTemplates.length;

  if (ddmTemplates.length === 0) {
    return {templates: [], debug};
  }

  debug.selectedSource = 'ddm';
  return {
    templates: ddmTemplates.map((row) => ({
      id: String(row.templateId ?? ''),
      name: String(row.nameCurrentValue ?? row.name ?? row.templateKey ?? row.templateId ?? ''),
      contentStructureId: Number(row.classPK ?? -1),
      externalReferenceCode: String(row.externalReferenceCode ?? row.templateKey ?? row.templateId ?? ''),
      templateScript: typeof row.script === 'string' ? row.script : undefined,
    })),
    debug,
  };
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
