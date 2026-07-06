import type {AppConfig} from '../../../core/config/load-config.js';
import {mapConcurrent} from '../../../core/concurrency.js';
import {createOAuthTokenClient, type OAuthTokenClient} from '../../../core/http/auth.js';
import {createLiferayApiClient, type HttpApiClient} from '../../../core/http/client.js';
import {trimLeadingSlash} from '../../../core/utils/text.js';
import {LiferayErrors} from '../errors/index.js';
import {fetchPagedItems} from '../inventory/liferay-inventory-shared.js';
import {createLiferayGateway, type LiferayGateway} from '../liferay-gateway.js';
import {resolveSite} from '../portal/site-resolution.js';

const REPORT_KIND = 'liferay-guest-visibility-diagnosis';
const REPORT_SCHEMA_VERSION = 1;
const GUEST_ROLE_NAME = 'Guest';
const VIEW_ACTION_ID = 'VIEW';
const PERMISSION_FETCH_CONCURRENCY = 4;

export type GuestVisibilityResourceType = 'structuredContent' | 'document';

type HeadlessListItem = {
  id?: number;
  title?: string;
  friendlyUrlPath?: string;
  fileName?: string;
};

type HeadlessListPage = {
  items?: HeadlessListItem[];
  lastPage?: number;
};

type PermissionEntry = {
  roleName?: string;
  actionIds?: string[];
};

export type GuestVisibilityGap = {
  resourceType: GuestVisibilityResourceType;
  id: number;
  title: string;
  visibleAuthenticated: true;
  visibleAnonymously: false;
  guestHasViewPermission: boolean | null;
  missingPermission: typeof VIEW_ACTION_ID | null;
  diagnosis: string;
  fix: string | null;
  permissionsPath: string;
};

export type GuestVisibilityPageCheck = {
  url: string;
  friendlyUrl: string;
  visibleAuthenticated: boolean;
  anonymousStatus: number;
  visibleAnonymously: boolean;
};

export type GuestVisibilityReport = {
  kind: typeof REPORT_KIND;
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  generatedAt: string;
  baseUrl: string;
  site: {
    id: number;
    friendlyUrlPath: string;
    name: string;
  };
  page?: GuestVisibilityPageCheck;
  anonymousApiAccessible: {
    structuredContents: boolean;
    documents: boolean;
  };
  checked: {
    structuredContents: number;
    documents: number;
  };
  gaps: GuestVisibilityGap[];
  notes: string[];
  ok: boolean;
};

export type GuestVisibilityOptions = {
  url?: string;
  site?: string;
  pageSize?: number;
};

type GuestVisibilityDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
  now?: () => Date;
};

type ResourceKindDescriptor = {
  resourceType: GuestVisibilityResourceType;
  reportKey: 'structuredContents' | 'documents';
  listPath: (siteId: number) => string;
  itemBasePath: string;
};

const RESOURCE_KINDS: ResourceKindDescriptor[] = [
  {
    resourceType: 'structuredContent',
    reportKey: 'structuredContents',
    listPath: (siteId) => `/o/headless-delivery/v1.0/sites/${siteId}/structured-contents?flatten=true`,
    itemBasePath: '/o/headless-delivery/v1.0/structured-contents',
  },
  {
    resourceType: 'document',
    reportKey: 'documents',
    listPath: (siteId) => `/o/headless-delivery/v1.0/sites/${siteId}/documents?flatten=true`,
    itemBasePath: '/o/headless-delivery/v1.0/documents',
  },
];

type DiagnosisTarget = {
  site: string;
  pageFriendlyUrl?: string;
};

export async function runGuestVisibilityDiagnosis(
  config: AppConfig,
  options: GuestVisibilityOptions,
  dependencies?: GuestVisibilityDependencies,
): Promise<GuestVisibilityReport> {
  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const tokenClient = dependencies?.tokenClient ?? createOAuthTokenClient();
  const gateway = createLiferayGateway(config, apiClient, tokenClient);
  const pageSize = options.pageSize ?? 100;

  const target = resolveDiagnosisTarget(options);
  const site = await resolveSite(config, target.site, {apiClient, tokenClient});

  const notes: string[] = [];
  let page: GuestVisibilityPageCheck | undefined;

  if (target.pageFriendlyUrl) {
    if (target.pageFriendlyUrl === '/') {
      notes.push('Site root URLs are not checked at page level; content scan still runs for the whole site.');
    } else {
      page = await checkPageGuestVisibility(config, apiClient, gateway, site.id, target.pageFriendlyUrl);
    }
  }

  const anonymousApiAccessible = {structuredContents: true, documents: true};
  const checked = {structuredContents: 0, documents: 0};
  const gaps: GuestVisibilityGap[] = [];

  for (const kind of RESOURCE_KINDS) {
    const result = await diagnoseResourceKind(config, apiClient, gateway, site.id, kind, pageSize, notes);
    anonymousApiAccessible[kind.reportKey] = result.anonymousApiAccessible;
    checked[kind.reportKey] = result.checkedCount;
    gaps.push(...result.gaps);
  }

  const pageOk = page === undefined || page.visibleAnonymously || !page.visibleAuthenticated;

  return {
    kind: REPORT_KIND,
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: (dependencies?.now ?? (() => new Date()))().toISOString(),
    baseUrl: config.liferay.url,
    site: {
      id: site.id,
      friendlyUrlPath: site.friendlyUrlPath,
      name: site.name,
    },
    ...(page === undefined ? {} : {page}),
    anonymousApiAccessible,
    checked,
    gaps,
    notes,
    ok: gaps.length === 0 && pageOk,
  };
}

function resolveDiagnosisTarget(options: GuestVisibilityOptions): DiagnosisTarget {
  if (options.url) {
    return parsePublicPageUrl(options.url);
  }

  if (options.site) {
    return {site: options.site};
  }

  throw LiferayErrors.diagnoseError('Provide --url (like /web/guest/home) or --site.');
}

function parsePublicPageUrl(rawUrl: string): DiagnosisTarget {
  let sanitized = rawUrl.trim();

  try {
    sanitized = new URL(sanitized).pathname;
  } catch {
    // Keep relative paths as they are.
  }

  sanitized = sanitized.split('#')[0].split('?')[0];

  const localeMatch = sanitized.match(/^\/[a-z]{2}(?:_[A-Z]{2})?(\/web\/.*)$/);
  if (localeMatch) {
    sanitized = localeMatch[1];
  }

  if (!sanitized.startsWith('/web/')) {
    throw LiferayErrors.diagnoseError(
      `Only public page URLs like /web/{site}/{page} are supported; received '${rawUrl}'. Use --site for private or root-level checks.`,
    );
  }

  const rest = sanitized.slice('/web/'.length);
  const slashIndex = rest.indexOf('/');
  const siteSlug = slashIndex > 0 ? rest.slice(0, slashIndex) : rest;
  const friendlyUrl = slashIndex > 0 ? rest.slice(slashIndex) : '/';

  if (siteSlug === '') {
    throw LiferayErrors.diagnoseError(`Could not extract a site from URL '${rawUrl}'.`);
  }

  return {site: `/${siteSlug}`, pageFriendlyUrl: friendlyUrl};
}

async function checkPageGuestVisibility(
  config: AppConfig,
  apiClient: HttpApiClient,
  gateway: LiferayGateway,
  siteId: number,
  friendlyUrl: string,
): Promise<GuestVisibilityPageCheck> {
  const slug = trimLeadingSlash(friendlyUrl);
  const pagePath = `/o/headless-delivery/v1.0/sites/${siteId}/site-pages/${slug}`;

  const authenticatedResponse = await gateway.getRaw<unknown>(pagePath);
  const anonymousResponse = await apiClient.get<unknown>(config.liferay.url, pagePath, {
    timeoutSeconds: config.liferay.timeoutSeconds,
  });

  return {
    url: friendlyUrl,
    friendlyUrl,
    visibleAuthenticated: authenticatedResponse.ok,
    anonymousStatus: anonymousResponse.status,
    visibleAnonymously: anonymousResponse.ok,
  };
}

async function diagnoseResourceKind(
  config: AppConfig,
  apiClient: HttpApiClient,
  gateway: LiferayGateway,
  siteId: number,
  kind: ResourceKindDescriptor,
  pageSize: number,
  notes: string[],
): Promise<{anonymousApiAccessible: boolean; checkedCount: number; gaps: GuestVisibilityGap[]}> {
  const listPath = kind.listPath(siteId);
  const authenticatedItems = await fetchPagedItems<HeadlessListItem>(config, listPath, pageSize, {
    apiClient,
    gateway,
  });

  const anonymous = await fetchAnonymousItemIds(config, apiClient, listPath, pageSize);

  if (!anonymous.accessible) {
    notes.push(
      `Anonymous access to ${listPath} is not available (status=${anonymous.status}); falling back to a permissions-only check for ${kind.reportKey}.`,
    );
  }

  const candidates = anonymous.accessible
    ? authenticatedItems.filter((item) => typeof item.id === 'number' && !anonymous.ids.has(item.id))
    : authenticatedItems.filter((item) => typeof item.id === 'number');

  const gaps = await mapConcurrent(candidates, PERMISSION_FETCH_CONCURRENCY, async (item) =>
    buildGapForItem(config, gateway, kind, item, anonymous.accessible),
  );

  return {
    anonymousApiAccessible: anonymous.accessible,
    checkedCount: authenticatedItems.length,
    gaps: gaps.filter((gap): gap is GuestVisibilityGap => gap !== null),
  };
}

async function buildGapForItem(
  config: AppConfig,
  gateway: LiferayGateway,
  kind: ResourceKindDescriptor,
  item: HeadlessListItem,
  anonymousApiAccessible: boolean,
): Promise<GuestVisibilityGap | null> {
  const id = item.id as number;
  const title = item.title ?? item.fileName ?? `#${id}`;
  const permissionsPath = `${kind.itemBasePath}/${id}/permissions`;

  const permissionsResponse = await gateway.getRaw<PermissionEntry[]>(permissionsPath);
  const permissions =
    permissionsResponse.ok && Array.isArray(permissionsResponse.data) ? permissionsResponse.data : null;

  if (permissions === null) {
    // Without readable permissions we can only report a gap when the anonymous
    // fetch already proved the resource is hidden for Guest.
    if (!anonymousApiAccessible) {
      return null;
    }

    return {
      resourceType: kind.resourceType,
      id,
      title,
      visibleAuthenticated: true,
      visibleAnonymously: false,
      guestHasViewPermission: null,
      missingPermission: null,
      diagnosis: `${kind.resourceType} ${id} ("${title}") is visible authenticated but hidden for anonymous users; its permissions could not be read (status=${permissionsResponse.status}). Check the OAuth2 client scopes.`,
      fix: null,
      permissionsPath,
    };
  }

  const guestEntry = permissions.find((entry) => entry.roleName === GUEST_ROLE_NAME);
  const guestActionIds = guestEntry?.actionIds ?? [];
  const guestHasView = guestActionIds.includes(VIEW_ACTION_ID);

  if (guestHasView) {
    // Permissions-only mode: nothing proves the resource is hidden, so no gap.
    if (!anonymousApiAccessible) {
      return null;
    }

    return {
      resourceType: kind.resourceType,
      id,
      title,
      visibleAuthenticated: true,
      visibleAnonymously: false,
      guestHasViewPermission: true,
      missingPermission: null,
      diagnosis: `${kind.resourceType} ${id} ("${title}") is hidden for anonymous users even though role ${GUEST_ROLE_NAME} has ${VIEW_ACTION_ID} on the resource itself. Check guest access on the parent folder, the site, or portal guest-API settings.`,
      fix: null,
      permissionsPath,
    };
  }

  return {
    resourceType: kind.resourceType,
    id,
    title,
    visibleAuthenticated: true,
    visibleAnonymously: false,
    guestHasViewPermission: false,
    missingPermission: VIEW_ACTION_ID,
    diagnosis: `Missing ${VIEW_ACTION_ID} permission for role ${GUEST_ROLE_NAME} on ${kind.resourceType} ${id} ("${title}"). This is the known gap for headless-created content: it does not inherit the default Guest View grant that UI-created content gets.`,
    fix: buildFixSuggestion(config.liferay.url, permissionsPath, guestActionIds),
    permissionsPath,
  };
}

function buildFixSuggestion(baseUrl: string, permissionsPath: string, guestActionIds: string[]): string {
  const fixedActionIds = JSON.stringify([...guestActionIds, VIEW_ACTION_ID]);
  return (
    `Grant role ${GUEST_ROLE_NAME} the ${VIEW_ACTION_ID} action: PUT ${baseUrl}${permissionsPath} ` +
    `with the current role entries plus {"roleName":"${GUEST_ROLE_NAME}","actionIds":${fixedActionIds}} ` +
    `(UI equivalent: Permissions action on the resource, check View for Guest).`
  );
}

async function fetchAnonymousItemIds(
  config: AppConfig,
  apiClient: HttpApiClient,
  basePath: string,
  pageSize: number,
): Promise<{accessible: boolean; status: number; ids: Set<number>}> {
  const ids = new Set<number>();
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const separator = basePath.includes('?') ? '&' : '?';
    const response = await apiClient.get<HeadlessListPage>(
      config.liferay.url,
      `${basePath}${separator}page=${page}&pageSize=${pageSize}`,
      {timeoutSeconds: config.liferay.timeoutSeconds},
    );

    if (!response.ok) {
      return {accessible: false, status: response.status, ids: new Set()};
    }

    for (const item of response.data?.items ?? []) {
      if (typeof item.id === 'number') {
        ids.add(item.id);
      }
    }

    lastPage = response.data?.lastPage ?? 1;
    page += 1;
  }

  return {accessible: true, status: 200, ids};
}

export function formatGuestVisibilityReport(report: GuestVisibilityReport): string {
  const lines: string[] = [
    report.ok ? 'GUEST_VISIBILITY_OK' : 'GUEST_VISIBILITY_GAPS',
    `baseUrl=${report.baseUrl}`,
    `site=${report.site.friendlyUrlPath} (${report.site.id}) ${report.site.name}`.trimEnd(),
  ];

  if (report.page) {
    const authenticatedLabel = report.page.visibleAuthenticated ? 'visible' : 'hidden';
    const anonymousLabel = report.page.visibleAnonymously ? 'visible' : 'hidden';
    lines.push(
      `page ${report.page.friendlyUrl}: authenticated=${authenticatedLabel} anonymous=${anonymousLabel} (anonymousStatus=${report.page.anonymousStatus})`,
    );
  }

  lines.push(
    `checked structuredContents=${report.checked.structuredContents} documents=${report.checked.documents}`,
    `anonymousApi structuredContents=${formatAccessLabel(report.anonymousApiAccessible.structuredContents)} documents=${formatAccessLabel(report.anonymousApiAccessible.documents)}`,
  );

  if (report.gaps.length > 0) {
    lines.push('', `Gaps (${report.gaps.length}):`);
    for (const gap of report.gaps) {
      lines.push(`- ${gap.diagnosis}`);
      if (gap.fix) {
        lines.push(`  fix: ${gap.fix}`);
      }
    }
  }

  if (report.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join('\n');
}

function formatAccessLabel(accessible: boolean): string {
  return accessible ? 'ok' : 'unavailable';
}
