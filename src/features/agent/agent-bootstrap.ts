import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {DoctorCheck, DoctorCheckStatus, DoctorReport, DoctorToolStatus} from '../doctor/doctor-types.js';
import {runDoctor} from '../doctor/doctor.service.js';
import {runAgentContext, type AgentContextReport} from './agent-context.js';

const BOOTSTRAP_CACHE_VERSION = 1;
const AI_BOOTSTRAP_INTENTS = [
  'discover',
  'develop',
  'deploy',
  'troubleshoot',
  'migrate-resources',
  'osgi-debug',
] as const;

export type AiBootstrapIntent = (typeof AI_BOOTSTRAP_INTENTS)[number];

export type AiBootstrapCacheInfo = {
  requestedTtlSeconds: number;
  hit: boolean;
  ageSeconds: number | null;
};

export type AiBootstrapResult = {
  ok: true;
  intent: AiBootstrapIntent;
  cache: AiBootstrapCacheInfo | null;
  context: AgentContextReport;
  doctor: DoctorReport | null;
  status: null;
  recommendedNext: string;
};

type CachedBootstrapPayload = {
  version: number;
  cachedAt: number;
  result: Omit<AiBootstrapResult, 'cache'>;
};

export async function runAiBootstrap(
  cwd: string,
  options: {
    intent: string;
    config: AppConfig;
    env?: NodeJS.ProcessEnv;
    cacheTtlSeconds?: number | null;
    cacheDir?: string;
    now?: () => number;
    runAgentContextFn?: typeof runAgentContext;
    runDoctorFn?: typeof runDoctor;
  },
): Promise<AiBootstrapResult> {
  const intent = parseAiBootstrapIntent(options.intent);
  const now = options.now ?? Date.now;
  const cacheTtlSeconds = options.cacheTtlSeconds ?? null;
  const cacheDir = options.cacheDir ?? path.join(os.tmpdir(), 'ldev-ai-bootstrap-cache');
  const cacheKey = buildBootstrapCacheKey({
    intent,
    cwd,
    projectRoot: options.config.repoRoot ?? cwd,
  });

  if (cacheTtlSeconds !== null && cacheTtlSeconds > 0) {
    const cached = await readBootstrapCache(cacheDir, cacheKey, cacheTtlSeconds, now);
    if (cached) {
      return {
        ...cached.result,
        cache: {
          requestedTtlSeconds: cacheTtlSeconds,
          hit: true,
          ageSeconds: cached.ageSeconds,
        },
      };
    }
  }

  const runAgentContextFn = options.runAgentContextFn ?? runAgentContext;
  const runDoctorFn = options.runDoctorFn ?? runDoctor;
  const context = await runAgentContextFn(cwd, {config: options.config});
  const doctor = await resolveBootstrapDoctor(context, {
    cwd,
    config: options.config,
    env: options.env,
    intent,
    runDoctorFn,
  });

  const result: Omit<AiBootstrapResult, 'cache'> = {
    ok: true,
    intent,
    context,
    doctor,
    status: null,
    recommendedNext: buildRecommendedNext(intent, doctor),
  };

  if (cacheTtlSeconds !== null && cacheTtlSeconds > 0) {
    await writeBootstrapCache(cacheDir, cacheKey, result, now);
  }

  return {
    ...result,
    cache:
      cacheTtlSeconds !== null && cacheTtlSeconds > 0
        ? {
            requestedTtlSeconds: cacheTtlSeconds,
            hit: false,
            ageSeconds: null,
          }
        : null,
  };
}

export function parseBootstrapCacheTtl(rawValue: string | undefined): number | null {
  if (rawValue === undefined) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliError('`--cache` must be a positive integer number of seconds.', {
      code: 'AI_BOOTSTRAP_CACHE_INVALID',
    });
  }

  return parsed;
}

function buildBootstrapCacheKey(input: {intent: AiBootstrapIntent; cwd: string; projectRoot: string}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({version: BOOTSTRAP_CACHE_VERSION, ...input}))
    .digest('hex');
}

async function readBootstrapCache(
  cacheDir: string,
  cacheKey: string,
  ttlSeconds: number,
  now: () => number,
): Promise<{result: AiBootstrapResult; ageSeconds: number} | null> {
  const filePath = path.join(cacheDir, `${cacheKey}.json`);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isCachedBootstrapPayload(parsed)) {
    return null;
  }

  const ageMs = now() - parsed.cachedAt;
  if (ageMs > ttlSeconds * 1000) {
    return null;
  }

  return {
    result: {...parsed.result, cache: null},
    ageSeconds: Math.floor(ageMs / 1000),
  };
}

async function writeBootstrapCache(
  cacheDir: string,
  cacheKey: string,
  result: Omit<AiBootstrapResult, 'cache'>,
  now: () => number,
): Promise<void> {
  const filePath = path.join(cacheDir, `${cacheKey}.json`);
  const payload: CachedBootstrapPayload = {
    version: BOOTSTRAP_CACHE_VERSION,
    cachedAt: now(),
    result,
  };

  await fs.mkdir(cacheDir, {recursive: true});
  await fs.writeFile(filePath, JSON.stringify(payload));
}

function isCachedBootstrapPayload(value: unknown): value is CachedBootstrapPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === BOOTSTRAP_CACHE_VERSION &&
    'cachedAt' in value &&
    typeof value.cachedAt === 'number' &&
    'result' in value &&
    typeof value.result === 'object' &&
    value.result !== null
  );
}

async function resolveBootstrapDoctor(
  context: AgentContextReport,
  options: {
    cwd: string;
    config: AppConfig;
    env?: NodeJS.ProcessEnv;
    intent: AiBootstrapIntent;
    runDoctorFn: typeof runDoctor;
  },
): Promise<DoctorReport | null> {
  if (options.intent === 'discover') {
    return null;
  }

  if (options.intent === 'develop') {
    return buildDevelopBootstrapDoctor(context);
  }

  return options.runDoctorFn(options.cwd, {
    config: options.config,
    env: options.env,
    scopes: resolveBootstrapScopes(options.intent),
  });
}

export function resolveBootstrapScopes(intent: string): Array<'basic' | 'runtime' | 'portal' | 'osgi'> {
  switch (intent) {
    case 'deploy':
      return ['basic', 'runtime'];
    case 'troubleshoot':
      return ['basic', 'runtime', 'portal'];
    case 'migrate-resources':
      return ['basic', 'portal'];
    case 'osgi-debug':
      return ['basic', 'runtime', 'osgi'];
    default:
      return ['basic'];
  }
}

function parseAiBootstrapIntent(intent: string): AiBootstrapIntent {
  if (isAiBootstrapIntent(intent)) {
    return intent;
  }

  throw new CliError(`Invalid bootstrap intent \`${intent}\`. Expected one of: ${AI_BOOTSTRAP_INTENTS.join(', ')}.`, {
    code: 'AI_BOOTSTRAP_INTENT_INVALID',
  });
}

function isAiBootstrapIntent(value: string): value is AiBootstrapIntent {
  return AI_BOOTSTRAP_INTENTS.includes(value as AiBootstrapIntent);
}

function buildRecommendedNext(intent: AiBootstrapIntent, doctor: DoctorReport | null): string {
  if (!doctor) {
    return 'proceed with discovery';
  }

  if (doctor.readiness.deploy === 'blocked') {
    return 'resolve doctor.readiness blockers';
  }

  if (intent === 'develop' && doctor.readiness.deploy === 'unknown') {
    return 'proceed with local edits; run `ldev ai bootstrap --intent=deploy --json` before deployment';
  }

  return 'proceed';
}

function buildDevelopBootstrapDoctor(context: AgentContextReport): DoctorReport {
  const startedAt = Date.now();
  const checks = buildDevelopChecks(context);
  const summary = {
    passed: checks.filter((check) => check.status === 'pass').length,
    warned: checks.filter((check) => check.status === 'warn').length,
    failed: checks.filter((check) => check.status === 'fail').length,
    skipped: checks.filter((check) => check.status === 'skip').length,
    durationMs: Math.max(1, Date.now() - startedAt),
  };

  return {
    ok: summary.failed === 0,
    contractVersion: 2,
    generatedAt: new Date().toISOString(),
    ranChecks: ['basic'],
    summary,
    stamp: {
      projectType: context.project.type,
      portalUrl: context.liferay.portalUrl,
      contractVersion: 2,
    },
    tools: buildDevelopTools(context),
    checks,
    readiness: buildDevelopReadiness(context, checks),
    runtime: null,
    portal: null,
    osgi: null,
  };
}

function buildDevelopChecks(context: AgentContextReport): DoctorCheck[] {
  const isBladeWorkspace = context.project.type === 'blade-workspace';
  const hasOAuth =
    context.liferay.auth.oauth2.clientId.status === 'present' &&
    context.liferay.auth.oauth2.clientSecret.status === 'present';

  return [
    basicToolCheck('git', 'Git', context.platform.tools.git, false),
    basicToolCheck('docker', 'Docker CLI', context.platform.tools.docker, isBladeWorkspace),
    {
      id: 'docker-daemon',
      scope: 'basic',
      status: 'skip',
      summary: 'docker daemon probe skipped in bootstrap develop; use `ldev doctor --json` when daemon state matters',
    },
    basicToolCheck('docker-compose', 'Docker Compose', context.platform.tools.dockerCompose, isBladeWorkspace),
    basicToolCheck('blade', 'Blade CLI', context.platform.tools.blade, !isBladeWorkspace),
    basicToolCheck('node', 'Node.js', context.platform.tools.node, false),
    basicToolCheck('java', 'Java', context.platform.tools.java, true),
    basicToolCheck('lcp', 'LCP CLI', context.platform.tools.lcp, true),
    basicToolCheck('playwright-cli', 'playwright-cli', context.platform.tools.playwrightCli, true),
    {
      id: 'repo-root',
      scope: 'basic',
      status: context.project.root ? 'pass' : 'fail',
      summary: context.project.root
        ? `repository detected at ${context.project.root}`
        : 'could not detect a supported project layout',
      remedy: context.project.root
        ? undefined
        : 'Run `ldev` from an `ldev-native` repo or a standard Liferay Workspace.',
    },
    {
      id: 'project-type',
      scope: 'basic',
      status: context.project.type === 'unknown' ? 'fail' : 'pass',
      summary: context.project.type === 'unknown' ? 'project type is unknown' : `${context.project.type} detected`,
    },
    {
      id: 'docker-env-file',
      scope: 'basic',
      status: isBladeWorkspace ? 'skip' : context.paths.dockerEnv ? 'pass' : 'warn',
      summary: isBladeWorkspace
        ? 'docker/.env is not used in a standard Liferay Workspace'
        : context.paths.dockerEnv
          ? `file detected at ${context.paths.dockerEnv}`
          : 'docker/.env does not exist; defaults and environment variables will be used',
      remedy:
        !isBladeWorkspace && !context.paths.dockerEnv
          ? 'Run `ldev env init` if you need a project-local docker/.env.'
          : undefined,
    },
    {
      id: 'liferay-profile-file',
      scope: 'basic',
      status: context.project.root ? (context.paths.liferayProfile ? 'pass' : 'skip') : 'skip',
      summary: context.paths.liferayProfile
        ? `file detected at ${context.paths.liferayProfile}`
        : 'optional; create when you need project-local CLI defaults',
    },
    {
      id: 'liferay-local-profile-file',
      scope: 'basic',
      status: context.project.root ? (context.paths.liferayLocalProfile ? 'pass' : 'skip') : 'skip',
      summary: context.paths.liferayLocalProfile
        ? `file detected at ${context.paths.liferayLocalProfile}`
        : 'optional; create for local OAuth credentials and overrides',
    },
    {
      id: 'liferay-url',
      scope: 'basic',
      status: context.liferay.portalUrl ? 'pass' : 'fail',
      summary: context.liferay.portalUrl ? `url=${context.liferay.portalUrl}` : 'LIFERAY_CLI_URL could not be resolved',
      remedy: context.liferay.portalUrl
        ? undefined
        : 'Set `LIFERAY_CLI_URL` in env, .liferay-cli.local.yml, docker/.env, or .liferay-cli.yml.',
    },
    {
      id: 'liferay-oauth2-client',
      scope: 'basic',
      status: hasOAuth ? 'pass' : 'warn',
      summary: hasOAuth
        ? 'OAuth2 credentials are configured'
        : 'client id or client secret is missing for authenticated Liferay commands',
      remedy: hasOAuth
        ? undefined
        : 'Define `LIFERAY_CLI_OAUTH2_CLIENT_ID` and `LIFERAY_CLI_OAUTH2_CLIENT_SECRET` before portal-authenticated workflows.',
    },
  ];
}

function buildDevelopTools(context: AgentContextReport): DoctorReport['tools'] {
  const isBladeWorkspace = context.project.type === 'blade-workspace';

  return {
    git: availabilityTool(context.platform.tools.git, false),
    blade: availabilityTool(context.platform.tools.blade, !isBladeWorkspace),
    docker: availabilityTool(context.platform.tools.docker, isBladeWorkspace),
    dockerDaemon: {
      status: 'warn',
      available: false,
      version: null,
      reason: 'not-probed',
    },
    dockerCompose: availabilityTool(context.platform.tools.dockerCompose, isBladeWorkspace),
    node: availabilityTool(context.platform.tools.node, false),
    java: availabilityTool(context.platform.tools.java, true),
    lcp: availabilityTool(context.platform.tools.lcp, true),
    playwrightCli: availabilityTool(context.platform.tools.playwrightCli, true),
  };
}

function buildDevelopReadiness(context: AgentContextReport, checks: DoctorCheck[]): DoctorReport['readiness'] {
  const hasCheckStatus = (id: string, statuses: DoctorCheckStatus[]) =>
    checks.some((check) => check.id === id && statuses.includes(check.status));
  const repoBlocked = hasCheckStatus('repo-root', ['fail']) || hasCheckStatus('project-type', ['fail']);
  const runtimeBlocked =
    repoBlocked ||
    (context.project.type === 'ldev-native' &&
      (hasCheckStatus('docker', ['fail']) || hasCheckStatus('docker-compose', ['fail']))) ||
    (context.project.type === 'blade-workspace' && hasCheckStatus('blade', ['fail']));
  const portalPrereqsBlocked =
    hasCheckStatus('liferay-url', ['fail']) || hasCheckStatus('liferay-oauth2-client', ['warn', 'fail']);

  return {
    setup: runtimeBlocked || context.project.type !== 'ldev-native' ? 'blocked' : 'unknown',
    start: runtimeBlocked ? 'blocked' : 'unknown',
    deploy: runtimeBlocked ? 'blocked' : 'unknown',
    reindex: repoBlocked || portalPrereqsBlocked ? 'blocked' : 'unknown',
    osgi: runtimeBlocked ? 'blocked' : 'unknown',
  };
}

function basicToolCheck(id: string, label: string, available: boolean, optional: boolean): DoctorCheck {
  return {
    id,
    label,
    scope: 'basic',
    status: available ? 'pass' : optional ? 'warn' : 'fail',
    summary: available ? `${label} available in PATH` : `${label.toLowerCase()} is not available in PATH`,
  };
}

function availabilityTool(available: boolean, optional: boolean): DoctorToolStatus {
  return {
    status: available ? 'pass' : optional ? 'warn' : 'fail',
    available,
    version: null,
    reason: available ? 'presence-only' : 'not-in-path',
  };
}
