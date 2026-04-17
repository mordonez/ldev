import type {AppConfig} from '../../core/config/load-config.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../core/http/auth.js';
import {createLiferayApiClient, type HttpApiClient} from '../../core/http/client.js';
import {fetchPagedItems, resolveSite} from './inventory/liferay-inventory-shared.js';
import {createLiferayGateway} from './liferay-gateway.js';
import {performLiferayHealthCheck} from './liferay-health.js';

export type LiferayAuditResult = {
  ok: true;
  baseUrl: string;
  clientId: string;
  tokenType: string;
  expiresIn: number;
  checkedPath: string;
  healthStatus: number;
  site: string;
  siteId: number;
  siteFriendlyUrl: string;
  siteName: string;
  structureCount: number;
  templateCount: number;
};

type AuditDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export async function runLiferayAudit(
  config: AppConfig,
  options?: {site?: string; pageSize?: number},
  dependencies?: AuditDependencies,
): Promise<LiferayAuditResult> {
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const token = await tokenClient.fetchClientCredentialsToken(config.liferay);
  const siteInput = options?.site ?? '/global';
  const pageSize = options?.pageSize ?? 200;

  const health = await performLiferayHealthCheck(createLiferayGateway(config, apiClient, tokenClient));
  const site = await resolveSite(config, siteInput, {apiClient, tokenClient});
  const [structures, templates] = await Promise.all([
    fetchPagedItems(config, `/o/data-engine/v2.0/sites/${site.id}/data-definitions/by-content-type/journal`, pageSize, {
      apiClient,
      tokenClient,
    }),
    fetchPagedItems(config, `/o/headless-delivery/v1.0/sites/${site.id}/content-templates`, pageSize, {
      apiClient,
      tokenClient,
    }),
  ]);

  return {
    ok: true,
    baseUrl: config.liferay.url,
    clientId: config.liferay.oauth2ClientId,
    tokenType: token.tokenType,
    expiresIn: token.expiresIn,
    checkedPath: health.checkedPath,
    healthStatus: health.status,
    site: siteInput,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    siteName: site.name,
    structureCount: structures.length,
    templateCount: templates.length,
  };
}

export function formatLiferayAudit(result: LiferayAuditResult): string {
  return [
    'AUDIT_OK',
    `baseUrl=${result.baseUrl}`,
    `clientId=${result.clientId}`,
    `site=${result.siteFriendlyUrl || result.site} (${result.siteId})`,
    `siteName=${result.siteName}`,
    `healthStatus=${result.healthStatus}`,
    `structureCount=${result.structureCount}`,
    `templateCount=${result.templateCount}`,
  ].join('\n');
}
