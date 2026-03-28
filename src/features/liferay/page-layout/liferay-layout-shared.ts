import type {AppConfig} from '../../../core/config/load-config.js';
import type {LiferayApiClient} from '../../../core/http/client.js';
import {authedGet, expectJsonSuccess} from '../inventory/liferay-inventory-shared.js';

export type Layout = {
  layoutId?: number;
  plid?: number;
  type?: string;
  nameCurrentValue?: string;
  friendlyURL?: string;
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
  const siteSlug = siteFriendlyUrl.startsWith('/') ? siteFriendlyUrl.slice(1) : siteFriendlyUrl;
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

function firstNonBlank(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim() !== '') ?? '';
}
