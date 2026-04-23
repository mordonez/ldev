import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {DoctorReport} from '../doctor/doctor-types.js';
import {runDoctor} from '../doctor/doctor.service.js';
import {buildDevelopBootstrapDoctor} from './agent-bootstrap-develop.js';
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
