import {CliError} from '../../../core/errors.js';
import {firstNonBlank, trimLeadingSlash} from '../../../core/utils/text.js';
import {LiferayErrors} from '../errors/index.js';
import type {LiferayGateway} from '../liferay-gateway.js';

export type Layout = {
  layoutId?: number;
  plid?: number;
  type?: string;
  nameCurrentValue?: string;
  titleCurrentValue?: string;
  descriptionCurrentValue?: string;
  keywordsCurrentValue?: string;
  robotsCurrentValue?: string;
  friendlyURL?: string;
  friendlyURLMap?: Record<string, string>;
  titleMap?: Record<string, string>;
  descriptionMap?: Record<string, string>;
  keywordsMap?: Record<string, string>;
  robotsMap?: Record<string, string>;
  robots?: string;
  themeId?: string;
  colorSchemeId?: string;
  css?: string;
  javascript?: string;
  typeSettingsProperties?: Record<string, unknown>;
  iconImage?: boolean;
  iconImageId?: number;
  faviconFileEntryId?: number;
  styleBookEntryId?: number;
  masterLayoutPlid?: number;
  layoutPrototypeLinkEnabled?: boolean;
  layoutPrototypeUuid?: string;
  sourcePrototypeLayoutUuid?: string;
  hidden?: boolean;
  typeSettings?: string;
};

export async function fetchLayoutsByParent(
  gateway: LiferayGateway,
  groupId: number,
  privateLayout: boolean,
  parentLayoutId: number,
): Promise<Layout[]> {
  try {
    const layouts = await gateway.getJson<Layout[]>(
      `/api/jsonws/layout/get-layouts?groupId=${groupId}&privateLayout=${privateLayout}&parentLayoutId=${parentLayoutId}`,
      'layout/get-layouts',
    );
    return Array.isArray(layouts) ? layouts : [];
  } catch (error) {
    if (error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR') {
      throw LiferayErrors.inventoryError(error.message);
    }
    throw error;
  }
}

export function buildPageUrl(siteFriendlyUrl: string, friendlyUrl: string, privateLayout: boolean): string {
  const siteSlug = trimLeadingSlash(siteFriendlyUrl);
  return `${privateLayout ? '/group/' : '/web/'}${siteSlug}${friendlyUrl}`;
}

export function buildLayoutDetails(typeSettings: string): {layoutTemplateId?: string; targetUrl?: string} {
  const values = parseTypeSettings(typeSettings);
  return {
    ...(values['layout-template-id'] ? {layoutTemplateId: values['layout-template-id']} : {}),
    ...(firstNonBlank(values.url, values.embeddedLayoutURL)
      ? {targetUrl: firstNonBlank(values.url, values.embeddedLayoutURL)}
      : {}),
  };
}

function parseTypeSettings(rawTypeSettings: string): Record<string, string> {
  const settings: Record<string, string> = {};
  if (rawTypeSettings.trim() === '') {
    return settings;
  }

  for (const line of rawTypeSettings.split(/\r?\n/)) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key !== '') {
      settings[key] = value;
    }
  }

  return settings;
}
