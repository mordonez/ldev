import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {ADT_WIDGET_DIR_BY_TYPE} from './liferay-resource-paths.js';
import {runLiferayResourceListAdts} from './liferay-resource-list-adts.js';

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
  const identifier = resolveIdentifier(options);
  const rows = await runLiferayResourceListAdts(
    config,
    {
      site: options.site ?? '/global',
      widgetType: options.widgetType,
      className: options.className,
      includeScript: true,
    },
    dependencies,
  );

  const matches = rows.filter((row) => matchesAdt(row, identifier));

  if (matches.length === 0) {
    throw new CliError(`ADT not found: ${identifier}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  if (matches.length > 1) {
    throw new CliError(`ADT ambiguo para ${identifier}. Usa --widget-type o --class-name para acotar la busqueda.`, {
      code: 'LIFERAY_RESOURCE_ERROR',
      details: matches.map((row) => ({
        widgetType: row.widgetType,
        templateId: row.templateId,
        templateKey: row.templateKey,
        adtName: row.adtName,
      })),
    });
  }

  const match = matches[0]!;
  return {
    siteFriendlyUrl: options.site ?? '/global',
    widgetType: match.widgetType,
    directory: ADT_WIDGET_DIR_BY_TYPE[match.widgetType] ?? match.widgetType.replaceAll('-', '_'),
    className: match.className,
    templateId: String(match.templateId),
    displayStyle: `ddmTemplate_${match.templateId}`,
    templateKey: match.templateKey,
    displayName: match.displayName,
    adtName: match.adtName,
    classNameId: match.classNameId,
    script: match.script ?? '',
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

function resolveIdentifier(options: {
  displayStyle?: string;
  id?: string;
  key?: string;
  name?: string;
  widgetType?: string;
}): string {
  if (options.id?.trim()) {
    return options.id.trim();
  }
  if (options.displayStyle?.trim()) {
    const trimmed = options.displayStyle.trim();
    return trimmed.startsWith('ddmTemplate_') ? trimmed.slice('ddmTemplate_'.length) : trimmed;
  }
  if (options.key?.trim()) {
    return options.key.trim();
  }
  if (options.name?.trim()) {
    return options.name.trim();
  }

  throw new CliError('adt requires --display-style, --id, --key, or --name', {
    code: 'LIFERAY_RESOURCE_ERROR',
  });
}

function matchesAdt(
  row: {
    widgetType: string;
    templateId: number;
    templateKey: string;
    displayName: string;
    adtName: string;
  },
  identifier: string,
): boolean {
  return (
    identifier === String(row.templateId) ||
    identifier === row.templateKey ||
    identifier === row.displayName ||
    identifier === row.adtName ||
    identifier === `ddmTemplate_${row.templateId}`
  );
}
