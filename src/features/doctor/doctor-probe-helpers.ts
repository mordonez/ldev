import {createOAuthTokenClient} from '../../core/http/auth.js';
import {createLiferayApiClient} from '../../core/http/client.js';
import {parseJsonUnknown, isRecord} from '../../core/utils/json.js';
import type {
  DoctorCheckStatus,
  DoctorContext,
  DoctorDependencies,
  DoctorOsgiBundleSummary,
  DoctorOsgiReport,
  DoctorPortalReport,
  DoctorPortalOauthReport,
  DoctorRuntimeReport,
  DoctorRuntimeService,
} from './doctor-types.js';

const PORTAL_PROBE_PATH = '/c/portal/login';
const PORTAL_PROBE_TIMEOUT_MS = 3000;

export function parseComposePsRows(output: string): DoctorRuntimeService[] {
  const parsed = parseJsonCollection(output);
  return parsed
    .map((row) => toRuntimeService(row))
    .filter((service): service is DoctorRuntimeService => service !== null);
}

export async function probePortalOauth(
  ctx: DoctorContext,
  options: {env?: NodeJS.ProcessEnv; dependencies?: DoctorDependencies} | undefined,
): Promise<DoctorPortalOauthReport | null> {
  if (!hasOAuthCredentials(ctx)) {
    return {
      status: 'skip',
      configured: false,
      summary: 'OAuth token probe skipped because credentials are not configured',
      tokenType: null,
      expiresIn: null,
      reason: 'credentials-missing',
    };
  }

  const createTokenClient = options?.dependencies?.createOAuthTokenClient ?? createOAuthTokenClient;
  const tokenClient = createTokenClient({
    apiClient: createLiferayApiClient({fetchImpl: options?.dependencies?.fetchImpl ?? fetch, maxAttempts: 1}),
    invalidClientRetryDelayMs: 250,
    invalidClientMaxWaitMs: 1000,
  });

  try {
    const token = await tokenClient.fetchClientCredentialsToken({
      ...ctx.config.liferay,
      timeoutSeconds: Math.min(ctx.config.liferay.timeoutSeconds, 3),
    });
    return {
      status: 'pass',
      configured: true,
      summary: `OAuth token probe succeeded (tokenType=${token.tokenType}, expiresIn=${token.expiresIn}s)`,
      tokenType: token.tokenType,
      expiresIn: token.expiresIn,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth token probe failed';
    return {
      status: 'fail',
      configured: true,
      summary: `OAuth token probe failed: ${message}`,
      tokenType: null,
      expiresIn: null,
      reason: 'token-request-failed',
    };
  }
}

export async function probePortalHttp(baseUrl: string, fetchImpl: typeof fetch): Promise<DoctorPortalReport['http']> {
  const url = `${baseUrl}${PORTAL_PROBE_PATH}`;

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(PORTAL_PROBE_TIMEOUT_MS),
    });

    if (response.status === 200 || response.status === 302) {
      return {
        status: 'pass',
        summary: `portal responded ${response.status} on ${PORTAL_PROBE_PATH}`,
        checkedPath: PORTAL_PROBE_PATH,
        httpStatus: response.status,
        reachable: true,
      };
    }

    return {
      status: 'warn',
      summary: `portal responded ${response.status} on ${PORTAL_PROBE_PATH}`,
      checkedPath: PORTAL_PROBE_PATH,
      httpStatus: response.status,
      reachable: response.status < 500,
    };
  } catch {
    return {
      status: 'warn',
      summary: `portal is unreachable at ${PORTAL_PROBE_PATH}`,
      checkedPath: PORTAL_PROBE_PATH,
      httpStatus: null,
      reachable: false,
    };
  }
}

export function parseOsgiBundles(output: string): DoctorOsgiBundleSummary[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\|/.test(line))
    .map((line) => {
      const parts = line.split('|').map((item) => item.trim());
      return {
        id: parts[0] ?? '',
        state: (parts[1] ?? 'UNKNOWN').toUpperCase(),
        name: parts[parts.length - 1] ?? line,
      };
    })
    .filter((bundle) => bundle.id !== '' && bundle.name !== '');
}

export function summarizeBundleCounts(bundles: DoctorOsgiBundleSummary[]): DoctorOsgiReport['bundleCounts'] {
  const counts = emptyBundleCounts();
  counts.total = bundles.length;

  for (const bundle of bundles) {
    switch (bundle.state) {
      case 'ACTIVE':
        counts.active += 1;
        break;
      case 'RESOLVED':
        counts.resolved += 1;
        break;
      case 'INSTALLED':
        counts.installed += 1;
        break;
      case 'FRAGMENT':
        counts.fragments += 1;
        break;
      default:
        counts.other += 1;
        break;
    }
  }

  return counts;
}

export function isServiceUnhealthy(service: DoctorRuntimeService): boolean {
  const state = service.state?.toLowerCase();
  const health = service.health?.toLowerCase();
  return health === 'unhealthy' || state === 'dead' || state === 'exited';
}

export function isServiceStopped(service: DoctorRuntimeService): boolean {
  const state = service.state?.toLowerCase();
  return !isServiceUnhealthy(service) && (state === undefined || !['running', 'created'].includes(state));
}

export function summarizeRuntimeServices(
  services: DoctorRuntimeService[],
  unhealthy: DoctorRuntimeService[],
  stopped: DoctorRuntimeService[],
): string {
  if (services.length === 0) {
    return 'docker compose did not report any managed services';
  }

  if (unhealthy.length === 0 && stopped.length === 0) {
    return `${services.length} compose services reported healthy/running`;
  }

  return `${services.length} compose services inspected; ${unhealthy.length} unhealthy and ${stopped.length} not running`;
}

export function suggestRuntimeRemedy(runtime: DoctorRuntimeReport): string {
  if (runtime.reason === 'docker-daemon-unavailable') {
    return 'Start Docker Desktop or the local Docker daemon, then re-run `ldev doctor --runtime`.';
  }
  return 'Start the local environment and re-run `ldev doctor --runtime` to refresh service state.';
}

export function suggestPortalOauthRemedy(oauth: DoctorPortalOauthReport): string {
  if (!oauth.configured) {
    return 'Configure `LIFERAY_CLI_OAUTH2_CLIENT_ID` and `LIFERAY_CLI_OAUTH2_CLIENT_SECRET`, then re-run `ldev doctor --portal`.';
  }
  return 'Verify the configured OAuth2 client credentials and scopes, then re-run `ldev doctor --portal`.';
}

export function hasOAuthCredentials(ctx: DoctorContext): boolean {
  return ctx.config.liferay.oauth2ClientId.trim() !== '' && ctx.config.liferay.oauth2ClientSecret.trim() !== '';
}

export function combineStatuses(left: DoctorCheckStatus, right: DoctorCheckStatus): DoctorCheckStatus {
  const order: DoctorCheckStatus[] = ['pass', 'skip', 'warn', 'fail'];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function parseJsonCollection(output: string): Record<string, unknown>[] {
  const trimmed = output.trim();
  if (trimmed === '') {
    return [];
  }

  try {
    const parsed = parseJsonUnknown(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter(isRecord);
    }
    if (isRecord(parsed)) {
      return [parsed];
    }
  } catch {
    // fall back to newline-delimited JSON
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      try {
        const parsed = parseJsonUnknown(line);
        return isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => row !== null);
}

function toRuntimeService(row: Record<string, unknown>): DoctorRuntimeService | null {
  const service = readString(row, ['Service', 'service']) ?? inferServiceFromName(readString(row, ['Name', 'name']));
  if (!service) {
    return null;
  }

  return {
    service,
    state: readString(row, ['State', 'state']),
    health: readString(row, ['Health', 'health']),
    exitCode: readNumber(row, ['ExitCode', 'exitCode']),
  };
}

function inferServiceFromName(name: string | null): string | null {
  if (!name) {
    return null;
  }

  const parts = name.split('-');
  return parts.length >= 2 ? (parts[parts.length - 2] ?? name) : name;
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return null;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

export function emptyBundleCounts(): DoctorOsgiReport['bundleCounts'] {
  return {
    total: 0,
    active: 0,
    resolved: 0,
    installed: 0,
    fragments: 0,
    other: 0,
  };
}
