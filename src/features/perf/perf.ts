import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {measureHttpLatency} from '../../core/http/latency.js';
import {resolveEsUrl} from '../reindex/reindex-shared.js';

import {resolveEnvContext} from '../env/env-shared.js';

export type PerfSnapshot = {
  capturedAt: string;
  portalLatencyMs: number | null;
  apiLatencyMs: number | null;
  searchLatencyMs: number | null;
};

export type PerfBaselineResult = {
  ok: true;
  baselineFile: string;
  snapshot: PerfSnapshot;
};

export type PerfCheckResult = {
  ok: true;
  baselineFile: string;
  baseline: PerfSnapshot;
  current: PerfSnapshot;
  deltas: {
    portalLatencyMs: number | null;
    apiLatencyMs: number | null;
    searchLatencyMs: number | null;
  };
  overall: 'ok' | 'degraded';
};

export async function runPerfBaseline(config: AppConfig, options?: {baseline?: string}): Promise<PerfBaselineResult> {
  const baselineFile = resolvePerfBaselineFile(config, options?.baseline);
  const snapshot = await capturePerfSnapshot(config);
  await fs.ensureDir(path.dirname(baselineFile));
  await fs.writeJson(baselineFile, snapshot, {spaces: 2});

  return {
    ok: true,
    baselineFile,
    snapshot,
  };
}

export async function runPerfCheck(config: AppConfig, options?: {baseline?: string}): Promise<PerfCheckResult> {
  const baselineFile = resolvePerfBaselineFile(config, options?.baseline);
  if (!(await fs.pathExists(baselineFile))) {
    throw new CliError(`No perf baseline found at ${baselineFile}. Run perf baseline first.`, {
      code: 'PERF_BASELINE_NOT_FOUND',
    });
  }

  const [baseline, current] = await Promise.all([
    fs.readJson(baselineFile) as Promise<PerfSnapshot>,
    capturePerfSnapshot(config),
  ]);

  const deltas = {
    portalLatencyMs: diffMetric(current.portalLatencyMs, baseline.portalLatencyMs),
    apiLatencyMs: diffMetric(current.apiLatencyMs, baseline.apiLatencyMs),
    searchLatencyMs: diffMetric(current.searchLatencyMs, baseline.searchLatencyMs),
  };

  const overall = [deltas.portalLatencyMs, deltas.apiLatencyMs, deltas.searchLatencyMs].some(
    (delta) => delta !== null && delta > 250,
  )
    ? 'degraded'
    : 'ok';

  return {
    ok: true,
    baselineFile,
    baseline,
    current,
    deltas,
    overall,
  };
}

export function formatPerfBaseline(result: PerfBaselineResult): string {
  return [
    `Baseline: ${result.baselineFile}`,
    `portalLatencyMs=${result.snapshot.portalLatencyMs ?? 'n/a'}`,
    `apiLatencyMs=${result.snapshot.apiLatencyMs ?? 'n/a'}`,
    `searchLatencyMs=${result.snapshot.searchLatencyMs ?? 'n/a'}`,
  ].join('\n');
}

export function formatPerfCheck(result: PerfCheckResult): string {
  return [
    `Overall: ${result.overall}`,
    `portalLatencyMs: ${formatDelta(result.current.portalLatencyMs, result.deltas.portalLatencyMs)}`,
    `apiLatencyMs: ${formatDelta(result.current.apiLatencyMs, result.deltas.apiLatencyMs)}`,
    `searchLatencyMs: ${formatDelta(result.current.searchLatencyMs, result.deltas.searchLatencyMs)}`,
  ].join('\n');
}

export async function capturePerfSnapshot(config: AppConfig): Promise<PerfSnapshot> {
  const envContext = resolveEnvContext(config);
  const esUrl = resolveEsUrl(config);

  const [portalLatencyMs, apiLatencyMs, searchLatencyMs] = await Promise.all([
    measureHttpLatency(`${envContext.portalUrl}/c/portal/login`),
    measureHttpLatency(`${config.liferay.url}/o/headless-admin-user/v1.0/sites/by-friendly-url-path/global`),
    measureHttpLatency(`${esUrl}/_cat/indices?format=json`),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    portalLatencyMs,
    apiLatencyMs,
    searchLatencyMs,
  };
}

function resolvePerfBaselineFile(config: AppConfig, explicitBaseline?: string): string {
  if (explicitBaseline?.trim()) {
    return path.resolve(explicitBaseline);
  }
  if (!config.repoRoot) {
    throw new CliError('perf requires repo root to resolve the default baseline.', {code: 'PERF_REPO_REQUIRED'});
  }

  return path.join(config.repoRoot, '.ldev', 'perf-baseline.json');
}

function diffMetric(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null) {
    return null;
  }

  return current - baseline;
}

function formatDelta(current: number | null, delta: number | null): string {
  if (current === null) {
    return 'n/a';
  }
  if (delta === null) {
    return `${current} ms`;
  }

  const sign = delta >= 0 ? '+' : '';
  return `${current} ms (${sign}${delta})`;
}
