import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';

import {resolveEnvContext} from './env-files.js';

export type DiagnosedException = {
  class: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  stackTrace: string;
  suggestedCauses: string[];
};

export type EnvLogsDiagnoseResult = {
  ok: true;
  service: string | null;
  since: string | null;
  warnings: number;
  linesAnalyzed: number;
  exceptions: DiagnosedException[];
};

export type EnvLogsDiagnoseOptions = {
  since?: string;
  service?: string;
  processEnv?: NodeJS.ProcessEnv;
};

type ExceptionGroup = {
  class: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  stackTrace: string;
};

const EXCEPTION_CLASS_PATTERN = /([a-zA-Z_$][\w$]*\.)*([A-Z][A-Za-z0-9_$]*(?:Exception|Error))/;
const STACK_CONTINUATION_PATTERN = /^(\s+at\s|\s*\.\.\. \d+ more|\s*Suppressed:|\s*Caused by:)/;
const TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:\d{2})?|\d{2}:\d{2}:\d{2}(?:\.\d+)?|\w{3} \d{2}, \d{4} [\d: ]+[AP]M)/;

export async function runEnvLogsDiagnose(
  config: AppConfig,
  options?: EnvLogsDiagnoseOptions,
): Promise<EnvLogsDiagnoseResult> {
  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker and docker compose are required for logs diagnose.', {
      code: 'ENV_CAPABILITY_MISSING',
    });
  }

  const args = ['logs', '--no-color'];
  if (options?.since) {
    args.push(`--since=${options.since}`);
  }
  if (options?.service) {
    args.push(options.service);
  }

  const result = await runDockerComposeOrThrow(context.dockerDir, args, {
    env: options?.processEnv,
  });

  return parseLogDiagnosis(result.stdout, {
    since: options?.since ?? null,
    service: options?.service ?? null,
  });
}

export function parseLogDiagnosis(
  content: string,
  options?: {service?: string | null; since?: string | null},
): EnvLogsDiagnoseResult {
  const lines = content.split(/\r?\n/);
  const groups = new Map<string, ExceptionGroup>();
  let warnings = 0;
  let currentExceptionKey: string | null = null;
  let currentStack: string[] = [];

  const flushCurrent = (): void => {
    if (!currentExceptionKey || currentStack.length === 0) {
      currentExceptionKey = null;
      currentStack = [];
      return;
    }

    const group = groups.get(currentExceptionKey);
    if (group && group.stackTrace === '') {
      group.stackTrace = currentStack.join('\n');
    }

    currentExceptionKey = null;
    currentStack = [];
  };

  for (const line of lines) {
    if (/\bWARN(?:ING)?\b/.test(line)) {
      warnings += 1;
    }

    const exceptionClass = extractExceptionClass(line);
    if (exceptionClass) {
      flushCurrent();

      const timestamp = extractTimestamp(line);
      const existing = groups.get(exceptionClass);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = timestamp ?? existing.lastSeen;
      } else {
        groups.set(exceptionClass, {
          class: exceptionClass,
          count: 1,
          firstSeen: timestamp,
          lastSeen: timestamp,
          stackTrace: '',
        });
      }

      currentExceptionKey = exceptionClass;
      currentStack = [line];
      continue;
    }

    if (currentExceptionKey && (STACK_CONTINUATION_PATTERN.test(line) || line.trim() === '')) {
      if (line.trim() !== '' || currentStack.length > 0) {
        currentStack.push(line);
      }
      continue;
    }

    flushCurrent();
  }

  flushCurrent();

  const exceptions = [...groups.values()]
    .map((group) => ({
      ...group,
      stackTrace: group.stackTrace || group.class,
      suggestedCauses: suggestCauses(group.class, group.stackTrace || group.class),
    }))
    .sort((left, right) => right.count - left.count || left.class.localeCompare(right.class));

  return {
    ok: true,
    service: options?.service ?? null,
    since: options?.since ?? null,
    warnings,
    linesAnalyzed: lines.filter((line) => line.trim() !== '').length,
    exceptions,
  };
}

export function formatEnvLogsDiagnose(result: EnvLogsDiagnoseResult): string {
  const lines = [
    'LOG_DIAGNOSE',
    `service=${result.service ?? 'all'}`,
    `since=${result.since ?? 'all'}`,
    `linesAnalyzed=${result.linesAnalyzed}`,
    `warnings=${result.warnings}`,
    `exceptions=${result.exceptions.length}`,
  ];

  for (const exception of result.exceptions) {
    lines.push(
      `${exception.class} count=${exception.count} firstSeen=${exception.firstSeen ?? 'n/a'} causes=${exception.suggestedCauses.join('; ') || 'unknown'}`,
    );
  }

  return lines.join('\n');
}

function extractExceptionClass(line: string): string | null {
  const matcher = line.match(EXCEPTION_CLASS_PATTERN);
  const candidate = matcher?.[0]?.trim();
  if (!candidate) {
    return null;
  }

  if (candidate.endsWith('Exceptions')) {
    return null;
  }

  return candidate;
}

function extractTimestamp(line: string): string | null {
  return line.match(TIMESTAMP_PATTERN)?.[1] ?? null;
}

function suggestCauses(exceptionClass: string, stackTrace: string): string[] {
  const causes = new Set<string>();
  const lowerTrace = stackTrace.toLowerCase();
  const lowerClass = exceptionClass.toLowerCase();

  if (lowerClass.includes('portalexception')) {
    causes.add('Validate permissions, content references, or missing data');
  }
  if (lowerClass.includes('nullpointer')) {
    causes.add('Review recent null-handling changes and uninitialized OSGi services');
  }
  if (lowerClass.includes('nosuch') || lowerTrace.includes('nosuch')) {
    causes.add('The requested resource does not exist or the reference is stale');
  }
  if (lowerClass.includes('sql') || lowerTrace.includes('postgres') || lowerTrace.includes('jdbc')) {
    causes.add('Inspect schema changes, queries, and PostgreSQL connectivity');
  }
  if (lowerTrace.includes('unsatisfied') || lowerTrace.includes('unresolved constraint')) {
    causes.add('There are OSGi bundles with unresolved dependencies');
  }
  if (lowerTrace.includes('permission') || lowerTrace.includes('principal')) {
    causes.add('Check permissions, technical user, and OAuth2 scope');
  }
  if (causes.size === 0) {
    causes.add('Review the stack trace and the latest deploy related to this module');
  }

  return [...causes];
}
