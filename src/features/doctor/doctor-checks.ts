import path from 'node:path';

import type {DoctorCheck, DoctorContext} from './doctor-types.js';
import {
  MIN_RECOMMENDED_MEMORY_BYTES,
  buildPortRecommendation,
  formatBytes,
  summarizePortCheck,
  summarizeTool,
} from './doctor-collectors.js';

export function buildDoctorChecks(ctx: DoctorContext): DoctorCheck[] {
  const {project, repoPaths, capabilities, tools, config, configSources, httpPort, httpPortStatus} = ctx;
  const isBladeWorkspace = project.projectType === 'blade-workspace';

  return [
    {
      id: 'git',
      label: 'Git',
      status: capabilities.hasGit ? 'pass' : 'fail',
      summary: capabilities.hasGit ? summarizeTool('git', tools.git) : 'git is not available in PATH',
    },
    {
      id: 'docker',
      label: 'Docker CLI',
      status: isBladeWorkspace ? (tools.docker.available ? 'pass' : 'warn') : tools.docker.available ? 'pass' : 'fail',
      summary: tools.docker.available
        ? summarizeTool('docker', tools.docker)
        : isBladeWorkspace
          ? 'docker is not available; only Docker-container Workspace flows are affected'
          : 'docker is not available in PATH',
      details: tools.docker.available
        ? undefined
        : ['Install Docker Desktop or Docker Engine and ensure `docker` is available in PATH.'],
    },
    {
      id: 'blade',
      label: 'Blade CLI',
      status: isBladeWorkspace ? (capabilities.hasBlade ? 'pass' : 'fail') : capabilities.hasBlade ? 'pass' : 'warn',
      summary: capabilities.hasBlade ? summarizeTool('blade', tools.blade) : 'blade is not available in PATH',
      details:
        isBladeWorkspace && !capabilities.hasBlade
          ? ['Install Blade CLI because `blade-workspace` runtime commands delegate to it.']
          : undefined,
    },
    {
      id: 'docker-daemon',
      label: 'Docker Daemon',
      status: isBladeWorkspace
        ? tools.dockerDaemon.available
          ? 'pass'
          : 'warn'
        : tools.dockerDaemon.available
          ? 'pass'
          : 'fail',
      summary: tools.dockerDaemon.available
        ? summarizeTool('docker daemon', tools.dockerDaemon)
        : tools.docker.available
          ? isBladeWorkspace
            ? 'docker CLI is available but the daemon is not responding; only Docker-container Workspace flows are affected'
            : 'docker CLI is available but the daemon is not responding'
          : 'docker daemon could not be checked because the docker CLI is missing',
      details: tools.dockerDaemon.available
        ? undefined
        : ['Start Docker Desktop or your local Docker service and run `ldev doctor` again.'],
    },
    {
      id: 'docker-compose',
      label: 'Docker Compose',
      status: isBladeWorkspace
        ? capabilities.hasDockerCompose
          ? 'pass'
          : 'warn'
        : capabilities.hasDockerCompose
          ? 'pass'
          : 'fail',
      summary: capabilities.hasDockerCompose
        ? summarizeTool('docker compose', tools.dockerCompose)
        : isBladeWorkspace
          ? 'docker compose is not available; only Docker-container Workspace flows are affected'
          : 'docker compose is not available',
    },
    {
      id: 'node',
      label: 'Node.js',
      status: capabilities.hasNode ? 'pass' : 'fail',
      summary: capabilities.hasNode ? summarizeTool('node', tools.node) : 'node is not available in PATH',
    },
    {
      id: 'repo-root',
      label: 'Repo Root',
      status: repoPaths.repoRoot ? 'pass' : 'fail',
      summary: repoPaths.repoRoot
        ? `repository detected at ${repoPaths.repoRoot} (type=${project.projectType})`
        : 'could not detect a supported project layout',
      details: repoPaths.repoRoot
        ? undefined
        : ['Use a supported layout: `ldev-native` (docker/ + liferay/) or a standard Liferay Workspace.'],
    },
    {
      id: 'project-type',
      label: 'Project Type',
      status: project.projectType === 'unknown' ? 'fail' : 'pass',
      summary:
        project.projectType === 'unknown'
          ? 'project type is unknown'
          : isBladeWorkspace
            ? `blade-workspace detected${project.workspace.product ? ` (product=${project.workspace.product})` : ''}`
            : 'ldev-native detected',
    },
    {
      id: 'worktree-context',
      label: 'Worktree Context',
      status: repoPaths.repoRoot ? 'pass' : 'warn',
      summary: repoPaths.repoRoot
        ? ctx.worktree
          ? 'running inside a worktree'
          : 'running in the main repository'
        : 'no repository context; worktree does not apply',
    },
    {
      id: 'docker-env-file',
      label: 'docker/.env',
      status: isBladeWorkspace ? 'skip' : repoPaths.dockerEnvFile ? 'pass' : 'warn',
      summary: isBladeWorkspace
        ? 'not used in a standard Liferay Workspace'
        : repoPaths.dockerEnvFile
          ? `file detected at ${repoPaths.dockerEnvFile}`
          : 'docker/.env does not exist; defaults and environment variables will be used',
      details:
        project.projectType === 'ldev-native' && repoPaths.repoRoot && !repoPaths.dockerEnvFile
          ? ['Run `ldev env init` to create or normalize docker/.env.']
          : undefined,
    },
    {
      id: 'liferay-profile-file',
      label: '.liferay-cli.yml',
      status: repoPaths.repoRoot ? (repoPaths.liferayProfileFile ? 'pass' : 'skip') : 'skip',
      summary: repoPaths.liferayProfileFile
        ? `file detected at ${repoPaths.liferayProfileFile}`
        : 'optional; create when you need project-local CLI defaults',
      details: undefined,
    },
    {
      id: 'liferay-local-profile-file',
      label: '.liferay-cli.local.yml',
      status: repoPaths.repoRoot ? (project.files.liferayLocalProfile ? 'pass' : 'skip') : 'skip',
      summary: project.files.liferayLocalProfile
        ? `file detected at ${project.files.liferayLocalProfile}`
        : 'optional; create for local OAuth credentials and non-versioned overrides',
      details: undefined,
    },
    {
      id: 'host-memory',
      label: 'Host Memory',
      status: ctx.totalMemoryBytes >= MIN_RECOMMENDED_MEMORY_BYTES ? 'pass' : 'warn',
      summary:
        ctx.totalMemoryBytes >= MIN_RECOMMENDED_MEMORY_BYTES
          ? `host memory ${formatBytes(ctx.totalMemoryBytes)} meets the recommended minimum`
          : `host memory ${formatBytes(ctx.totalMemoryBytes)} is below the recommended 8 GB for Docker + Liferay`,
      details:
        ctx.totalMemoryBytes >= MIN_RECOMMENDED_MEMORY_BYTES
          ? undefined
          : ['Increase Docker/host memory before running Elasticsearch and Liferay together.'],
    },
    {
      id: 'http-port',
      label: 'HTTP Port',
      status: isBladeWorkspace
        ? 'skip'
        : project.env.bindIp && httpPort
          ? httpPortStatus === 'free'
            ? 'pass'
            : 'warn'
          : 'warn',
      summary: isBladeWorkspace
        ? 'port managed by the Workspace runtime, not by ldev'
        : summarizePortCheck(project.env.bindIp, httpPort, httpPortStatus),
      details: isBladeWorkspace ? undefined : buildPortRecommendation(project.env.bindIp, httpPort, httpPortStatus),
    },
    {
      id: 'liferay-url',
      label: 'Liferay URL',
      status: config.liferay.url.trim() !== '' ? 'pass' : 'fail',
      summary:
        config.liferay.url.trim() !== ''
          ? `url=${config.liferay.url} (source=${configSources.url})`
          : 'LIFERAY_CLI_URL could not be resolved',
      details:
        config.liferay.url.trim() !== ''
          ? undefined
          : [
              'Set `LIFERAY_CLI_URL` in your shell, .liferay-cli.local.yml, docker/.env (legacy), or .liferay-cli.yml so portal commands know where to connect.',
            ],
    },
    {
      id: 'liferay-oauth2-client',
      label: 'Liferay OAuth2',
      status:
        config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== ''
          ? 'pass'
          : 'warn',
      summary:
        config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== ''
          ? `credentials configured (id=${configSources.oauth2ClientId}, secret=${configSources.oauth2ClientSecret})`
          : 'client id or client secret is missing for authenticated Liferay commands',
      details:
        config.liferay.oauth2ClientId.trim() !== '' && config.liferay.oauth2ClientSecret.trim() !== ''
          ? undefined
          : [
              'Define LIFERAY_CLI_OAUTH2_CLIENT_ID and LIFERAY_CLI_OAUTH2_CLIENT_SECRET in env, .liferay-cli.local.yml, or docker/.env as a legacy fallback.',
            ],
    },
    {
      id: 'activation-key',
      label: 'Activation Key',
      status:
        ctx.activationKeyFile === null
          ? 'warn'
          : ctx.activationKeyExists && ctx.activationKeyValidName
            ? 'pass'
            : 'fail',
      summary:
        ctx.activationKeyFile === null
          ? 'LDEV_ACTIVATION_KEY_FILE is not configured; DXP users must pass a valid activation key before start'
          : ctx.activationKeyExists && ctx.activationKeyValidName
            ? `activation key ready at ${ctx.activationKeyFile}`
            : ctx.activationKeyExists
              ? `activation key file name is invalid: ${path.basename(ctx.activationKeyFile)}`
              : `activation key file does not exist: ${ctx.activationKeyFile}`,
      details:
        ctx.activationKeyFile === null
          ? [
              'Set `LDEV_ACTIVATION_KEY_FILE` or pass `ldev start --activation-key-file /path/to/activation-key-*.xml` when using DXP.',
            ]
          : ctx.activationKeyExists && ctx.activationKeyValidName
            ? undefined
            : [
                'Use a readable `activation-key-*.xml` file and point `LDEV_ACTIVATION_KEY_FILE` to it before running `ldev start`.',
              ],
    },
    {
      id: 'java',
      label: 'Java (legacy)',
      status: capabilities.hasJava ? 'pass' : 'warn',
      summary: capabilities.hasJava
        ? summarizeTool('java', tools.java)
        : 'java is not available; local Liferay builds and Gradle-based workflows may fail',
      details: capabilities.hasJava
        ? undefined
        : ['Install a supported JDK if you build modules, themes, or other Java-based Liferay artifacts locally.'],
    },
    {
      id: 'lcp',
      label: 'LCP CLI (optional)',
      status: capabilities.hasLcp ? 'pass' : 'warn',
      summary: capabilities.hasLcp
        ? summarizeTool('lcp', tools.lcp)
        : 'lcp is not available; this only affects specific legacy/local workflows',
    },
  ];
}
