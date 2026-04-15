import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {runLiferayInventoryTemplates} from '../inventory/liferay-inventory-templates.js';
import {buildResourceSiteChain, resolveResourceSite, listDdmTemplates} from './liferay-resource-shared.js';
import {matchesDdmTemplate, matchesInventoryTemplate} from '../liferay-identifiers.js';
import type {DdmTemplatePayload} from './liferay-resource-payloads.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceTemplateResult = {
  siteId: number;
  siteFriendlyUrl: string;
  siteName: string;
  id: string;
  templateId: string;
  templateKey: string;
  externalReferenceCode: string;
  name: string;
  contentStructureId: number;
  templateScript: string;
  raw: Record<string, unknown>;
};

export async function runLiferayResourceGetTemplate(
  config: AppConfig,
  options: {site?: string; id: string},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceTemplateResult> {
  const siteChain = await buildResourceSiteChain(config, options.site ?? '/global', dependencies);
  let site = await resolveResourceSite(config, options.site ?? '/global', dependencies);
  let match: DdmTemplatePayload | undefined;

  for (const candidate of siteChain) {
    const candidateSite = await resolveResourceSite(config, candidate.siteFriendlyUrl, dependencies);
    const templates = await listDdmTemplates(config, candidateSite, dependencies, {
      includeCompanyFallback: candidate.siteFriendlyUrl === '/global',
    });
    match = templates.find((item) => matchesTemplate(item, options.id));
    if (match) {
      site = candidateSite;
      break;
    }
  }

  if (!match) {
    for (const candidate of siteChain) {
      const candidateSite = await resolveResourceSite(config, candidate.siteFriendlyUrl, dependencies);
      const inventoryTemplates = await runLiferayInventoryTemplates(
        config,
        {site: candidateSite.friendlyUrlPath},
        dependencies,
      );
      const inventoryMatch = inventoryTemplates.find((item) => matchesInventoryTemplate(item, options.id));

      if (inventoryMatch) {
        site = candidateSite;
        match = {
          templateId: inventoryMatch.id,
          templateKey: inventoryMatch.externalReferenceCode || inventoryMatch.id,
          externalReferenceCode: inventoryMatch.externalReferenceCode || inventoryMatch.id,
          nameCurrentValue: inventoryMatch.name,
          name: inventoryMatch.name,
          script: inventoryMatch.templateScript ?? '',
          classPK: inventoryMatch.contentStructureId,
        };
        break;
      }
    }
  }

  if (!match) {
    throw new CliError(`Template not found: ${options.id}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  return {
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    siteName: site.name,
    id: String(match.templateKey ?? match.templateId ?? ''),
    templateId: String(match.templateId ?? ''),
    templateKey: String(match.templateKey ?? match.templateId ?? ''),
    externalReferenceCode: String(match.externalReferenceCode ?? match.templateKey ?? ''),
    name: String(match.nameCurrentValue ?? match.templateKey ?? ''),
    contentStructureId: Number(match.classPK ?? -1),
    templateScript: String(match.script ?? ''),
    raw: match,
  };
}

export function formatLiferayResourceTemplate(result: LiferayResourceTemplateResult): string {
  return [
    'RESOURCE_TEMPLATE',
    `siteId=${result.siteId}`,
    `siteFriendlyUrl=${result.siteFriendlyUrl}`,
    `siteName=${result.siteName}`,
    `templateId=${result.templateId}`,
    `templateKey=${result.templateKey}`,
    `externalReferenceCode=${result.externalReferenceCode}`,
    `name=${result.name}`,
    `contentStructureId=${result.contentStructureId}`,
  ].join('\n');
}

const matchesTemplate = matchesDdmTemplate;
