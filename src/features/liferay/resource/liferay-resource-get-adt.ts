import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import {ADT_WIDGET_DIR_BY_TYPE} from './liferay-resource-paths.js';
import {runLiferayResourceListAdts} from './liferay-resource-list-adts.js';
import {buildResourceSiteChain} from './liferay-resource-shared.js';
import {matchesAdtRow, normalizeAdtIdentifier} from '../liferay-identifiers.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceAdtResult = {
  siteFriendlyUrl: string;
  widgetType: string;
  directory: string;
  className: string;
  templateId: string;
  displayStyle: string;
  templateKey: string;
  displayName: string;
  adtName: string;
  classNameId: number;
  script: string;
};

export async function runLiferayResourceGetAdt(
  config: AppConfig,
  options: {
    site?: string;
    displayStyle?: string;
    id?: string;
    key?: string;
    name?: string;
    widgetType?: string;
    className?: string;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceAdtResult> {
  const identifier = normalizeAdtIdentifier(options);

  if (options.site?.trim()) {
    // Walk up the site hierarchy: child → parent → … → root. Return the first match.
    const siteChain = await buildResourceSiteChain(config, options.site, dependencies);

    for (const site of siteChain) {
      const rows = await runLiferayResourceListAdts(
        config,
        {
          site: site.siteFriendlyUrl,
          widgetType: options.widgetType,
          className: options.className,
          includeScript: true,
        },
        dependencies,
      );

      for (const row of rows) {
        if (!matchesAdtRow(row, identifier)) {
          continue;
        }
        return {
          siteFriendlyUrl: site.siteFriendlyUrl,
          widgetType: row.widgetType,
          directory: ADT_WIDGET_DIR_BY_TYPE[row.widgetType] ?? row.widgetType.replaceAll('-', '_'),
          className: row.className,
          templateId: String(row.templateId),
          displayStyle: `ddmTemplate_${row.templateId}`,
          templateKey: row.templateKey,
          displayName: row.displayName,
          adtName: row.adtName,
          classNameId: row.classNameId,
          script: row.script ?? '',
        };
      }
    }

    throw new CliError(`ADT not found: ${identifier}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  // No site specified: search across all accessible sites and detect ambiguity.
  const searchedSites = await collectSearchSites(config, dependencies);
  const matches: Array<LiferayResourceAdtResult & {siteId?: number; siteName?: string}> = [];

  for (const site of searchedSites) {
    const rows = await runLiferayResourceListAdts(
      config,
      {
        site: site.siteFriendlyUrl,
        widgetType: options.widgetType,
        className: options.className,
        includeScript: true,
      },
      dependencies,
    );

    for (const row of rows) {
      if (!matchesAdtRow(row, identifier)) {
        continue;
      }

      matches.push({
        siteId: site.siteId,
        siteName: site.siteName,
        siteFriendlyUrl: site.siteFriendlyUrl,
        widgetType: row.widgetType,
        directory: ADT_WIDGET_DIR_BY_TYPE[row.widgetType] ?? row.widgetType.replaceAll('-', '_'),
        className: row.className,
        templateId: String(row.templateId),
        displayStyle: `ddmTemplate_${row.templateId}`,
        templateKey: row.templateKey,
        displayName: row.displayName,
        adtName: row.adtName,
        classNameId: row.classNameId,
        script: row.script ?? '',
      });
    }
  }

  if (matches.length === 0) {
    throw new CliError(`ADT not found: ${identifier}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  if (matches.length > 1) {
    throw new CliError(
      `ADT is ambiguous for ${identifier}. Use --site, --widget-type, or --class-name to narrow the search.`,
      {
        code: 'LIFERAY_RESOURCE_ERROR',
        details: matches.map((row) => ({
          site: row.siteFriendlyUrl,
          widgetType: row.widgetType,
          templateId: row.templateId,
          templateKey: row.templateKey,
          adtName: row.adtName,
        })),
      },
    );
  }

  const match = matches[0]!;
  return {
    siteFriendlyUrl: match.siteFriendlyUrl,
    widgetType: match.widgetType,
    directory: match.directory,
    className: match.className,
    templateId: match.templateId,
    displayStyle: match.displayStyle,
    templateKey: match.templateKey,
    displayName: match.displayName,
    adtName: match.adtName,
    classNameId: match.classNameId,
    script: match.script,
  };
}

export function formatLiferayResourceAdt(result: LiferayResourceAdtResult): string {
  return [
    'RESOURCE_ADT',
    `site=${result.siteFriendlyUrl}`,
    `widgetType=${result.widgetType}`,
    `directory=${result.directory}`,
    `className=${result.className}`,
    `templateId=${result.templateId}`,
    `displayStyle=${result.displayStyle}`,
    `templateKey=${result.templateKey}`,
    `name=${result.adtName}`,
  ].join('\n');
}

async function collectSearchSites(
  config: AppConfig,
  dependencies?: ResourceDependencies,
): Promise<Array<{siteId: number; siteFriendlyUrl: string; siteName: string}>> {
  const sites = await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies);
  return sites.map((site) => ({
    siteId: site.groupId,
    siteFriendlyUrl: site.siteFriendlyUrl,
    siteName: site.name,
  }));
}
