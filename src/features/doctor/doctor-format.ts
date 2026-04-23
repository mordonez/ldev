import type {DoctorCheck, DoctorCheckScope, DoctorCheckStatus, DoctorContext, DoctorReport} from './doctor-types.js';

export function assembleDoctorReport(
  ctx: DoctorContext,
  checks: DoctorCheck[],
  durationMs = 0,
  ranChecks: DoctorCheckScope[] = ['basic'],
  sections?: Pick<DoctorReport, 'runtime' | 'portal' | 'osgi'>,
): DoctorReport {
  const normalizedChecks = checks.map((check) => normalizeCheck(check));
  const summary = {
    passed: normalizedChecks.filter((c) => c.status === 'pass').length,
    warned: normalizedChecks.filter((c) => c.status === 'warn').length,
    failed: normalizedChecks.filter((c) => c.status === 'fail').length,
    skipped: normalizedChecks.filter((c) => c.status === 'skip').length,
    durationMs,
  };

  return {
    ok: summary.failed === 0,
    contractVersion: 2,
    generatedAt: new Date().toISOString(),
    ranChecks,
    summary,
    stamp: {
      projectType: ctx.project.projectType,
      portalUrl: ctx.project.env.portalUrl,
      contractVersion: 2,
    },
    tools: {
      git: toolStatusFromCheck(ctx.tools.git, normalizedChecks, 'git'),
      blade: toolStatusFromCheck(ctx.tools.blade, normalizedChecks, 'blade'),
      docker: toolStatusFromCheck(ctx.tools.docker, normalizedChecks, 'docker'),
      dockerDaemon: toolStatusFromCheck(ctx.tools.dockerDaemon, normalizedChecks, 'docker-daemon'),
      dockerCompose: toolStatusFromCheck(ctx.tools.dockerCompose, normalizedChecks, 'docker-compose'),
      node: toolStatusFromCheck(ctx.tools.node, normalizedChecks, 'node'),
      java: toolStatusFromCheck(ctx.tools.java, normalizedChecks, 'java'),
      lcp: toolStatusFromCheck(ctx.tools.lcp, normalizedChecks, 'lcp'),
      playwrightCli: toolStatusFromCheck(ctx.tools.playwrightCli, normalizedChecks, 'playwright-cli'),
    },
    checks: normalizedChecks,
    readiness: buildReadiness(ctx, normalizedChecks),
    runtime: sections?.runtime ?? null,
    portal: sections?.portal ?? null,
    osgi: sections?.osgi ?? null,
  };
}

export function formatDoctor(report: DoctorReport): string {
  const lines = [
    `${report.summary.passed} passed   ${report.summary.warned} warned   ${report.summary.failed} failed   (${(report.summary.durationMs / 1000).toFixed(1)}s)`,
  ];
  const actionableChecks = report.checks.filter((check) => check.status === 'warn' || check.status === 'fail');

  if (actionableChecks.length > 0) {
    lines.push(
      '',
      ...actionableChecks.flatMap((check) => [
        `${formatStatus(check.status)} ${check.id.padEnd(18)} ${check.summary}`,
        ...(check.remedy ? [`   -> ${check.remedy}`] : []),
      ]),
    );
  }

  const probeLines = [
    report.runtime ? `Runtime: ${formatStatus(report.runtime.status)} ${report.runtime.summary}` : null,
    report.portal ? `Portal:  ${formatStatus(report.portal.status)} ${report.portal.summary}` : null,
    report.osgi ? `OSGi:    ${formatStatus(report.osgi.status)} ${report.osgi.summary}` : null,
  ].filter((line): line is string => line !== null);

  if (probeLines.length > 0) {
    lines.push('', ...probeLines);
  }

  lines.push('', 'Run `ldev doctor --runtime` to check running containers.');
  lines.push('Run `ldev doctor --portal` to validate Liferay HTTP + OAuth.');
  lines.push('Run `ldev doctor --osgi` to validate Gogo connectivity.');

  return lines.join('\n');
}

export function formatStatus(status: DoctorCheckStatus): string {
  switch (status) {
    case 'pass':
      return '[PASS]';
    case 'warn':
      return '[WARN]';
    case 'skip':
      return '[SKIP]';
    default:
      return '[FAIL]';
  }
}

function normalizeCheck(check: DoctorCheck): DoctorCheck {
  return {
    id: check.id,
    status: check.status,
    scope: check.scope ?? 'basic',
    summary: check.summary,
    remedy: check.remedy ?? check.details?.[0],
  };
}

function toolStatusFromCheck(
  tool: DoctorReport['tools'][keyof DoctorReport['tools']],
  checks: DoctorCheck[],
  checkId: string,
): DoctorReport['tools'][keyof DoctorReport['tools']] {
  const check = checks.find((entry) => entry.id === checkId);
  const status = check?.status === 'fail' ? 'fail' : check?.status === 'warn' ? 'warn' : tool.status;

  return {
    status,
    available: tool.available,
    version: tool.version,
    reason: tool.reason,
  };
}

function buildReadiness(ctx: DoctorContext, checks: DoctorCheck[]): DoctorReport['readiness'] {
  const statusOf = (id: string) => checks.find((check) => check.id === id)?.status;
  const hasAny = (ids: string[], statuses: DoctorCheckStatus[]) =>
    checks.some((check) => ids.includes(check.id) && statuses.includes(check.status));
  const repoBlocked = hasAny(['repo-root', 'project-type'], ['fail']);
  const nativeRuntimeBlocked =
    ctx.project.projectType === 'ldev-native' && hasAny(['docker', 'docker-compose', 'docker-daemon'], ['fail']);
  const workspaceRuntimeBlocked = ctx.project.projectType === 'blade-workspace' && hasAny(['blade'], ['fail']);
  const runtimePrereqBlocked = repoBlocked || nativeRuntimeBlocked || workspaceRuntimeBlocked;
  const runtimeProbeRequested = statusOf('runtime-services') !== undefined;
  const portalProbeRequested = statusOf('portal-http') !== undefined;
  const osgiProbeRequested = statusOf('osgi-gogo') !== undefined;
  const oauthBlocked = hasAny(['liferay-url', 'liferay-oauth2-client'], ['fail', 'warn']);
  const nativeRuntime = ctx.project.projectType === 'ldev-native';

  return {
    setup: runtimePrereqBlocked || !nativeRuntime ? 'blocked' : 'ready',
    start: runtimePrereqBlocked ? 'blocked' : 'ready',
    deploy:
      runtimePrereqBlocked || (runtimeProbeRequested && statusOf('runtime-services') !== 'pass') ? 'blocked' : 'ready',
    reindex:
      repoBlocked || oauthBlocked
        ? 'blocked'
        : portalProbeRequested
          ? statusOf('portal-http') === 'pass' && statusOf('portal-oauth') !== 'fail'
            ? 'ready'
            : 'blocked'
          : 'unknown',
    osgi: runtimePrereqBlocked
      ? 'blocked'
      : osgiProbeRequested
        ? statusOf('osgi-gogo') === 'pass'
          ? 'ready'
          : 'blocked'
        : 'unknown',
  };
}
