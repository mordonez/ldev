import {createOAuthTokenClient} from '../../core/http/auth.js';
import {createLiferayApiClient} from '../../core/http/client.js';
import {runDockerCompose} from '../../core/platform/docker.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {parseJsonUnknown, isRecord} from '../../core/utils/json.js';
import {runGogoCommand} from '../osgi/osgi-shared.js';
import type {
  DoctorCheck,
  DoctorCheckScope,
  DoctorCheckStatus,
  DoctorContext,
  DoctorDependencies,
  DoctorOsgiBundleSummary,
  DoctorOsgiReport,
  DoctorPortalOauthReport,
  DoctorPortalReport,
  DoctorRuntimeReport,
  DoctorRuntimeService,
} from './doctor-types.js';

const PORTAL_PROBE_PATH = '/c/portal/login';
const PORTAL_PROBE_TIMEOUT_MS = 3000;
const RUNTIME_PROBE_TIMEOUT_MS = 3000;

type DoctorProbeSections = {
  checks: DoctorCheck[];
  runtime: DoctorRuntimeReport | null;
  portal: DoctorPortalReport | null;
  osgi: DoctorOsgiReport | null;
};

export async function collectDoctorProbeSections(
  ctx: DoctorContext,
  scopes: DoctorCheckScope[],
  options?: {env?: NodeJS.ProcessEnv; dependencies?: DoctorDependencies},
): Promise<DoctorProbeSections> {
  const requestedScopes = new Set(scopes);
  const checks: DoctorCheck[] = [];
  let runtime: DoctorRuntimeReport | null = null;
  let portal: DoctorPortalReport | null = null;
  let osgi: DoctorOsgiReport | null = null;

  if (requestedScopes.has('runtime')) {
    runtime = await probeDoctorRuntime(ctx, options);
    checks.push({
      id: 'runtime-services',
      scope: 'runtime',
      status: runtime.status,
      summary: runtime.summary,
      remedy: runtime.status === 'pass' ? undefined : suggestRuntimeRemedy(runtime),
    });
  }

  if (requestedScopes.has('portal')) {
    portal = await probeDoctorPortal(ctx, options);
    checks.push({
      id: 'portal-http',
      scope: 'portal',
      status: portal.http.status,
      summary: portal.http.summary,
      remedy:
        portal.http.status === 'pass'
          ? undefined
          : 'Verify the local portal URL and start the environment before retrying portal checks.',
    });

    if (portal.oauth) {
      checks.push({
        id: 'portal-oauth',
        scope: 'portal',
        status: portal.oauth.status,
        summary: portal.oauth.summary,
        remedy: portal.oauth.status === 'pass' ? undefined : suggestPortalOauthRemedy(portal.oauth),
      });
    }
  }

  if (requestedScopes.has('osgi')) {
    osgi = await probeDoctorOsgi(ctx, options);
    checks.push({
      id: 'osgi-gogo',
      scope: 'osgi',
      status: osgi.status,
      summary: osgi.summary,
      remedy:
        osgi.status === 'pass'
          ? undefined
          : 'Ensure the runtime is up and the Gogo shell is reachable before running OSGi workflows.',
    });
  }

  return {checks, runtime, portal, osgi};
}

async function probeDoctorRuntime(
  ctx: DoctorContext,
  options?: {env?: NodeJS.ProcessEnv; dependencies?: DoctorDependencies},
): Promise<DoctorRuntimeReport> {
  if (ctx.project.projectType !== 'ldev-native' || !ctx.project.repo.root || !ctx.config.dockerDir) {
    return {
      status: 'skip',
      summary: 'runtime probe skipped because this project does not expose the local docker runtime adapter',
      reason: 'runtime-adapter-unavailable',
      services: [],
    };
  }

  if (!ctx.tools.docker.available || !ctx.tools.dockerCompose.available || !ctx.tools.dockerDaemon.available) {
    return {
      status: 'skip',
      summary: 'runtime probe skipped because Docker Compose is not currently available',
      reason: 'docker-daemon-unavailable',
      services: [],
    };
  }

  const runDockerComposeFn = options?.dependencies?.runDockerCompose ?? runDockerCompose;
  const envContext = resolveEnvContext(ctx.config);
  const composeEnv = buildComposeEnv(envContext, {baseEnv: options?.env});
  const result = await runDockerComposeFn(envContext.dockerDir, ['ps', '--all', '--format', 'json'], {
    env: composeEnv,
    reject: false,
    timeoutMs: RUNTIME_PROBE_TIMEOUT_MS,
  });

  if (!result.ok) {
    return {
      status: 'warn',
      summary: 'docker compose ps could not inspect local services',
      reason: 'compose-ps-failed',
      services: [],
    };
  }

  const parsedRows = parseComposePsRows(result.stdout);
  const declaredServices = ctx.project.inventory.runtime.services.filter((service) => !service.endsWith('-available'));
  const serviceMap = new Map<string, DoctorRuntimeService>();

  for (const row of parsedRows) {
    serviceMap.set(row.service, row);
  }

  for (const service of declaredServices) {
    if (!serviceMap.has(service)) {
      serviceMap.set(service, {
        service,
        state: null,
        health: null,
        exitCode: null,
      });
    }
  }

  const services = [...serviceMap.values()].sort((left, right) => left.service.localeCompare(right.service));
  const unhealthy = services.filter((service) => isServiceUnhealthy(service));
  const stopped = services.filter((service) => isServiceStopped(service));

  if (services.length === 0) {
    return {
      status: 'warn',
      summary: 'docker compose did not report any managed services',
      reason: 'no-services-reported',
      services,
    };
  }

  if (unhealthy.length > 0 || stopped.length > 0) {
    return {
      status: 'warn',
      summary: summarizeRuntimeServices(services, unhealthy, stopped),
      services,
    };
  }

  return {
    status: 'pass',
    summary: summarizeRuntimeServices(services, unhealthy, stopped),
    services,
  };
}

async function probeDoctorPortal(
  ctx: DoctorContext,
  options?: {env?: NodeJS.ProcessEnv; dependencies?: DoctorDependencies},
): Promise<DoctorPortalReport> {
  const baseUrl = ctx.config.liferay.url.trim();
  const fetchImpl = options?.dependencies?.fetchImpl ?? fetch;

  if (baseUrl === '') {
    return {
      status: 'skip',
      summary: 'portal probe skipped because LIFERAY_CLI_URL is not configured',
      http: {
        status: 'skip',
        summary: 'portal URL is not configured',
        checkedPath: PORTAL_PROBE_PATH,
        httpStatus: null,
        reachable: false,
      },
      oauth: null,
    };
  }

  const http = await probePortalHttp(baseUrl, fetchImpl);

  if (http.status !== 'pass') {
    return {
      status: 'warn',
      summary: http.summary,
      http,
      oauth: {
        status: 'skip',
        configured: hasOAuthCredentials(ctx),
        summary: hasOAuthCredentials(ctx)
          ? 'OAuth probe skipped because the portal is not reachable yet'
          : 'OAuth probe skipped because credentials are not configured',
        tokenType: null,
        expiresIn: null,
        reason: http.reachable ? 'portal-http-unhealthy' : 'portal-unreachable',
      },
    };
  }

  const oauth = await probePortalOauth(ctx, options);
  const status = oauth?.status === 'skip' ? 'warn' : combineStatuses(http.status, oauth?.status ?? 'skip');

  return {
    status,
    summary:
      oauth === null
        ? http.summary
        : status === 'pass'
          ? 'portal HTTP probe succeeded and OAuth credentials are valid'
          : oauth.summary,
    http,
    oauth,
  };
}

async function probeDoctorOsgi(
  ctx: DoctorContext,
  options?: {env?: NodeJS.ProcessEnv; dependencies?: DoctorDependencies},
): Promise<DoctorOsgiReport> {
  const canAttemptNative = ctx.project.projectType === 'ldev-native' && ctx.tools.dockerDaemon.available;
  const canAttemptWorkspace = ctx.project.projectType === 'blade-workspace' && ctx.tools.blade.available;

  if (!canAttemptNative && !canAttemptWorkspace) {
    return {
      status: 'skip',
      summary: 'OSGi probe skipped because the runtime adapter is not currently available',
      reason: 'runtime-unavailable',
      bundleCounts: emptyBundleCounts(),
      problematicBundles: [],
    };
  }

  const runGogoCommandFn = options?.dependencies?.runGogoCommand ?? runGogoCommand;

  let output: string;
  try {
    output = await runGogoCommandFn(ctx.config, 'lb -s', options?.env);
  } catch {
    return {
      status: 'warn',
      summary: 'OSGi probe could not execute `lb -s` against the local runtime',
      reason: 'gogo-unavailable',
      bundleCounts: emptyBundleCounts(),
      problematicBundles: [],
    };
  }

  const bundles = parseOsgiBundles(output);
  if (bundles.length === 0) {
    return {
      status: 'warn',
      summary: 'OSGi probe connected, but no bundle state lines were returned',
      reason: 'no-bundles-reported',
      bundleCounts: emptyBundleCounts(),
      problematicBundles: [],
    };
  }

  const bundleCounts = summarizeBundleCounts(bundles);
  const problematicBundles = bundles.filter((bundle) => !['ACTIVE', 'FRAGMENT'].includes(bundle.state)).slice(0, 10);

  return {
    status: problematicBundles.length === 0 ? 'pass' : 'warn',
    summary:
      problematicBundles.length === 0
        ? `Gogo reachable; ${bundleCounts.active}/${bundleCounts.total} bundles active and no unresolved bundles detected`
        : `Gogo reachable; ${problematicBundles.length} problematic bundles detected (${bundleCounts.resolved} resolved, ${bundleCounts.installed} installed)`,
    bundleCounts,
    problematicBundles,
  };
}

async function probePortalHttp(baseUrl: string, fetchImpl: typeof fetch): Promise<DoctorPortalReport['http']> {
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

async function probePortalOauth(
  ctx: DoctorContext,
  options?: {env?: NodeJS.ProcessEnv; dependencies?: DoctorDependencies},
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

function parseComposePsRows(output: string): DoctorRuntimeService[] {
  const parsed = parseJsonCollection(output);
  return parsed
    .map((row) => toRuntimeService(row))
    .filter((service): service is DoctorRuntimeService => service !== null);
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

function hasOAuthCredentials(ctx: DoctorContext): boolean {
  return ctx.config.liferay.oauth2ClientId.trim() !== '' && ctx.config.liferay.oauth2ClientSecret.trim() !== '';
}

function isServiceUnhealthy(service: DoctorRuntimeService): boolean {
  const state = service.state?.toLowerCase();
  const health = service.health?.toLowerCase();
  return health === 'unhealthy' || state === 'dead' || state === 'exited';
}

function isServiceStopped(service: DoctorRuntimeService): boolean {
  const state = service.state?.toLowerCase();
  return !isServiceUnhealthy(service) && (state === undefined || !['running', 'created'].includes(state));
}

function summarizeRuntimeServices(
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

function suggestRuntimeRemedy(runtime: DoctorRuntimeReport): string {
  if (runtime.reason === 'docker-daemon-unavailable') {
    return 'Start Docker Desktop or the local Docker daemon, then re-run `ldev doctor --runtime`.';
  }
  return 'Start the local environment and re-run `ldev doctor --runtime` to refresh service state.';
}

function suggestPortalOauthRemedy(oauth: DoctorPortalOauthReport): string {
  if (!oauth.configured) {
    return 'Configure `LIFERAY_CLI_OAUTH2_CLIENT_ID` and `LIFERAY_CLI_OAUTH2_CLIENT_SECRET`, then re-run `ldev doctor --portal`.';
  }
  return 'Verify the configured OAuth2 client credentials and scopes, then re-run `ldev doctor --portal`.';
}

function combineStatuses(left: DoctorCheckStatus, right: DoctorCheckStatus): DoctorCheckStatus {
  const order: DoctorCheckStatus[] = ['pass', 'skip', 'warn', 'fail'];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function parseOsgiBundles(output: string): DoctorOsgiBundleSummary[] {
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

function summarizeBundleCounts(bundles: DoctorOsgiBundleSummary[]): DoctorOsgiReport['bundleCounts'] {
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

function emptyBundleCounts(): DoctorOsgiReport['bundleCounts'] {
  return {
    total: 0,
    active: 0,
    resolved: 0,
    installed: 0,
    fragments: 0,
    other: 0,
  };
}
