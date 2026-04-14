import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {firstNonBlank, trimLeadingSlash} from '../../../core/utils/text.js';
import {authedGet, expectJsonSuccess} from '../inventory/liferay-inventory-shared.js';

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
  config: AppConfig,
  apiClient: LiferayApiClient,
  accessToken: string,
  groupId: number,
  privateLayout: boolean,
  parentLayoutId: number,
): Promise<Layout[]> {
  const response = await authedGet<Layout[]>(
    config,
    apiClient,
    accessToken,
    `/api/jsonws/layout/get-layouts?groupId=${groupId}&privateLayout=${privateLayout}&parentLayoutId=${parentLayoutId}`,
  );
  const success = await expectJsonSuccess(response, 'layout/get-layouts');
  return Array.isArray(success.data) ? success.data : [];
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
