import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/liferay/auth.js';
import type {LiferayApiClient} from '../../core/liferay/client.js';
import {runLiferayInventoryTemplates} from './liferay-inventory-templates.js';
import {resolveResourceSite, listDdmTemplates} from './liferay-resource-shared.js';

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
  const site = await resolveResourceSite(config, options.site ?? '/global', dependencies);
  const templates = await listDdmTemplates(config, site, dependencies);
  let match = templates.find((item) => matchesTemplate(item, options.id));

  if (!match) {
    const inventoryTemplates = await runLiferayInventoryTemplates(config, {site: site.friendlyUrlPath}, dependencies);
    const inventoryMatch = inventoryTemplates.find((item) => (
      options.id === item.id ||
      options.id === item.externalReferenceCode ||
      options.id === item.name
    ));

    if (inventoryMatch) {
      match = {
        templateId: inventoryMatch.id,
        templateKey: inventoryMatch.externalReferenceCode || inventoryMatch.id,
        externalReferenceCode: inventoryMatch.externalReferenceCode || inventoryMatch.id,
        nameCurrentValue: inventoryMatch.name,
        name: inventoryMatch.name,
        script: inventoryMatch.templateScript ?? '',
        classPK: inventoryMatch.contentStructureId,
      };
    }
  }

  if (!match) {
    throw new CliError(`template no encontrado: ${options.id}`, {
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

function matchesTemplate(item: Record<string, unknown>, identifier: string): boolean {
  const templateId = String(item.templateId ?? '');
  const templateKey = String(item.templateKey ?? '');
  const externalReferenceCode = String(item.externalReferenceCode ?? '');
  const nameCurrentValue = String(item.nameCurrentValue ?? '');
  const name = String(item.name ?? '');

  return (
    identifier === templateId ||
    identifier === templateKey ||
    identifier === externalReferenceCode ||
    identifier === nameCurrentValue ||
    identifier === name
  );
}
