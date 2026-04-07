import type {DoctorCheck, DoctorCheckStatus, DoctorContext, DoctorReport} from './doctor-types.js';
import {countScopeAliases} from './doctor-collectors.js';

export function assembleDoctorReport(ctx: DoctorContext, checks: DoctorCheck[]): DoctorReport {
  const summary = {
    passed: checks.filter((c) => c.status === 'pass').length,
    warned: checks.filter((c) => c.status === 'warn').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    skipped: checks.filter((c) => c.status === 'skip').length,
  };

  return {
    ok: summary.failed === 0,
    summary,
    capabilities: ctx.capabilities,
    tools: ctx.tools,
    environment: {
      cwd: ctx.project.cwd,
      projectType: ctx.project.projectType,
      repoRoot: ctx.project.repo.root,
      inRepo: ctx.project.repo.inRepo,
      isWorktree: ctx.worktree,
      bindIp: ctx.project.env.bindIp,
      httpPort: ctx.project.env.httpPort,
      portalUrl: ctx.project.env.portalUrl,
      dataRoot: ctx.project.env.dataRoot,
      activationKeyFile: ctx.activationKeyFile,
      dockerDir: ctx.project.repo.dockerDir,
      liferayDir: ctx.project.repo.liferayDir,
      files: {
        dockerEnv: ctx.project.files.dockerEnv,
        liferayProfile: ctx.project.files.liferayProfile,
        liferayLocalProfile: ctx.project.files.liferayLocalProfile,
      },
    },
    config: {
      liferay: {
        url: ctx.config.liferay.url,
        oauth2ClientIdConfigured: ctx.config.liferay.oauth2ClientId.trim() !== '',
        oauth2ClientSecretConfigured: ctx.config.liferay.oauth2ClientSecret.trim() !== '',
        scopeAliasesCount: countScopeAliases(ctx.config.liferay.scopeAliases),
        timeoutSeconds: ctx.config.liferay.timeoutSeconds,
      },
      sources: ctx.configSources,
    },
    ai: ctx.ai,
    checks,
  };
}

export function formatDoctor(report: DoctorReport): string {
  const lines = [
    `Doctor: ${report.ok ? 'OK' : 'FAIL'} (${report.summary.passed} pass, ${report.summary.warned} warn, ${report.summary.failed} fail${report.summary.skipped > 0 ? `, ${report.summary.skipped} skip` : ''})`,
    '',
    'Checks',
    ...report.checks.map((check) => `${formatStatus(check.status)} ${check.label}: ${check.summary}`),
    '',
    'Context',
    `cwd=${report.environment.cwd}`,
    `projectType=${report.environment.projectType}`,
    `repoRoot=${report.environment.repoRoot ?? '-'}`,
    `worktree=${report.environment.isWorktree}`,
    `bindIp=${report.environment.bindIp ?? '-'}`,
    `httpPort=${report.environment.httpPort ?? '-'}`,
    `portalUrl=${report.environment.portalUrl ?? '-'}`,
    `dataRoot=${report.environment.dataRoot ?? '-'}`,
    `activationKeyFile=${report.environment.activationKeyFile ?? '-'}`,
    `dockerEnv=${report.environment.files.dockerEnv ?? '-'}`,
    `liferayProfile=${report.environment.files.liferayProfile ?? '-'}`,
    `liferayLocalProfile=${report.environment.files.liferayLocalProfile ?? '-'}`,
    '',
    'Config',
    `liferay.url=${report.config.liferay.url} (source=${report.config.sources.url})`,
    `oauth2ClientIdConfigured=${report.config.liferay.oauth2ClientIdConfigured} (source=${report.config.sources.oauth2ClientId})`,
    `oauth2ClientSecretConfigured=${report.config.liferay.oauth2ClientSecretConfigured} (source=${report.config.sources.oauth2ClientSecret})`,
    `scopeAliasesCount=${report.config.liferay.scopeAliasesCount} (source=${report.config.sources.scopeAliases})`,
    `timeoutSeconds=${report.config.liferay.timeoutSeconds} (source=${report.config.sources.timeoutSeconds})`,
    '',
    'AI',
    `manifestPresent=${report.ai.manifestPresent}`,
    `managedRules=${report.ai.managedRules}`,
    `modifiedRules=${report.ai.modifiedRules}`,
    `stalePackageRules=${report.ai.stalePackageRules}`,
    `staleRuntimeRules=${report.ai.staleRuntimeRules}`,
  ];

  const recommendationLines = report.checks
    .filter((check) => check.details && check.details.length > 0)
    .flatMap((check) => check.details ?? [])
    .map((detail) => `- ${detail}`);
  const aiWarningLines = report.ai.warnings.map((warning) => `- ${warning}`);

  if (recommendationLines.length > 0 || aiWarningLines.length > 0) {
    lines.push('', 'Recommendations', ...recommendationLines, ...aiWarningLines);
  }

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
