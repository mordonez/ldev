import type {AppConfig} from '../../../core/config/load-config.js';
import {CliError} from '../../../core/errors.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type HttpApiClient} from '../../../core/http/client.js';
import type {Printer} from '../../../core/output/printer.js';
import {LiferayErrors} from '../errors/index.js';
import {resolveSite} from '../inventory/liferay-inventory-shared.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import type {ContentPruneOptions} from './liferay-content-prune.js';

export type PruneDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
  printer?: Printer;
};

export type PruneContext = {
  apiClient: HttpApiClient;
  tokenClient: OAuthTokenClient;
  printer?: Printer;
  gateway: LiferayGateway;
  longRunningGateway: LiferayGateway;
  groupId: number;
  siteFriendlyUrl?: string;
  rootFolderIds: number[];
  wholeFolderDelete: boolean;
};

export function assertValidContentPruneOptions(options: ContentPruneOptions): void {
  if (
    (options.site === undefined && options.groupId === undefined) ||
    (options.site && options.groupId !== undefined)
  ) {
    throw LiferayErrors.contentPruneError('Use exactly one of site or groupId.');
  }
}

export async function createPruneContext(
  config: AppConfig,
  options: ContentPruneOptions,
  dependencies?: PruneDependencies,
): Promise<PruneContext> {
  const rootFolderIds = [...new Set(options.rootFolders)];
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const gateway = createLiferayGateway(config, apiClient, tokenClient);
  const longRunningGateway = createLiferayGateway(
    {
      ...config,
      liferay: {
        ...config.liferay,
        timeoutSeconds: Math.max(config.liferay.timeoutSeconds, 600),
      },
    },
    apiClient,
    tokenClient,
  );

  let groupId: number;
  let siteFriendlyUrl: string | undefined;

  if (options.site) {
    const site = await resolveSite(config, options.site, {apiClient, tokenClient});
    groupId = site.id;
    siteFriendlyUrl = site.friendlyUrlPath;
  } else {
    groupId = options.groupId!;
  }

  return {
    apiClient,
    tokenClient,
    printer: dependencies?.printer,
    gateway,
    longRunningGateway,
    groupId,
    siteFriendlyUrl,
    rootFolderIds,
    wholeFolderDelete: !options.dryRun && canDeleteWholeFolders(options),
  };
}

export function canDeleteWholeFolders(options: ContentPruneOptions): boolean {
  return (!options.structures || options.structures.length === 0) && (options.keep === undefined || options.keep === 0);
}

export function isPresentNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

export function isGatewayError(error: unknown): error is CliError {
  return error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR';
}

export function isGatewayStatus(error: unknown, status: number): boolean {
  return isGatewayError(error) && error.message.includes(`status=${status}`);
}

export function getGatewayStatus(error: CliError): number | undefined {
  const match = /status=(\d+)/.exec(error.message);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}
