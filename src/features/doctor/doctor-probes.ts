import {runDockerCompose} from '../../core/platform/docker.js';
import {buildComposeEnv, resolveEnvContext} from '../../core/runtime/env-context.js';
import {runGogoCommand} from '../../core/runtime/gogo-command.js';
import type {
  DoctorCheck,
  DoctorCheckScope,
  DoctorContext,
  DoctorDependencies,
  DoctorOsgiReport,
  DoctorPortalReport,
  DoctorRuntimeReport,
  DoctorRuntimeService,
} from './doctor-types.js';
import {
  combineStatuses,
  emptyBundleCounts,
  hasOAuthCredentials,
  isServiceStopped,
  isServiceUnhealthy,
  parseComposePsRows,
  parseOsgiBundles,
  probePortalHttp,
  probePortalOauth,
  suggestPortalOauthRemedy,
  suggestRuntimeRemedy,
  summarizeBundleCounts,
  summarizeRuntimeServices,
} from './doctor-probe-helpers.js';

const RUNTIME_PROBE_TIMEOUT_MS = 3000;
const PORTAL_PROBE_PATH = '/c/portal/login';

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
  const serviceMap: Map<string, DoctorRuntimeService> = new Map();

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
