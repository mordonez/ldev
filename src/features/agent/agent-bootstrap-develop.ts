import type {DoctorCheck, DoctorCheckStatus, DoctorReport, DoctorToolStatus} from '../doctor/doctor-types.js';
import type {AgentContextReport} from './agent-context.js';

export function buildDevelopBootstrapDoctor(context: AgentContextReport): DoctorReport {
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
