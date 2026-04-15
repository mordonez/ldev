import path from 'node:path';

import type {AppConfig} from '../../core/config/load-config.js';
import {runDocker, runDockerCompose} from '../../core/platform/docker.js';
import {buildComposeEnv, resolveEnvContext} from '../env/env-files.js';
import {escapeShellArg, uniquePaths} from './deploy-artifacts.js';

const DEPLOY_TARGET_DIR = '/opt/liferay/deploy';
const DEPLOY_SOURCE_DIR = '/mnt/liferay/deploy';

export async function hotDeployArtifactsToRunningLiferay(
  config: AppConfig,
  artifacts: string[],
): Promise<{hotDeployed: boolean; copied: number; reason: string | null; target: string | null}> {
  const envContext = resolveEnvContext(config);
  const composeEnv = buildComposeEnv(envContext, {baseEnv: process.env});
  const liferayTarget = await resolveRunningLiferayTarget(
    envContext.dockerDir,
    envContext.composeProjectName,
    composeEnv,
  );

  if (!liferayTarget) {
    return {hotDeployed: false, copied: 0, reason: 'running liferay container was not found', target: null};
  }

  let copied = 0;
  const failures: string[] = [];
  const uniqueArtifacts = uniquePaths(artifacts);
  for (const artifact of uniqueArtifacts) {
    const fileName = path.basename(artifact);
    const escapedFileName = escapeShellArg(fileName);
    const command = `mkdir -p ${DEPLOY_TARGET_DIR} && if [ ${DEPLOY_SOURCE_DIR}/${escapedFileName} -ef ${DEPLOY_TARGET_DIR}/${escapedFileName} ] 2>/dev/null; then true; else cp -f ${DEPLOY_SOURCE_DIR}/${escapedFileName} ${DEPLOY_TARGET_DIR}/; fi`;
    const result =
      liferayTarget.kind === 'compose'
        ? await runDockerCompose(envContext.dockerDir, ['exec', '-T', 'liferay', 'sh', '-lc', command], {
            env: composeEnv,
            reject: false,
          })
        : await runDocker(['exec', liferayTarget.containerId, 'sh', '-lc', command], {
            env: process.env,
            reject: false,
          });
    if (result.ok) {
      copied += 1;
    } else {
      failures.push(result.stderr.trim() || result.stdout.trim() || `could not copy ${fileName}`);
    }
  }

  const hasFailures = failures.length > 0;
  const allCopied = copied === uniqueArtifacts.length && uniqueArtifacts.length > 0;
  const reason = hasFailures
    ? failures.length === uniqueArtifacts.length
      ? `all artifacts failed to hot deploy: ${failures[0]}`
      : `${failures.length}/${uniqueArtifacts.length} artifacts failed to hot deploy: ${failures.join('; ')}`
    : null;

  return {
    hotDeployed: allCopied,
    copied,
    reason,
    target: liferayTarget.containerId,
  };
}

async function resolveRunningLiferayTarget(
  dockerDir: string,
  composeProjectName: string,
  composeEnv: NodeJS.ProcessEnv,
): Promise<{kind: 'compose' | 'docker'; containerId: string} | null> {
  const composePs = await runDockerCompose(dockerDir, ['ps', '-q', 'liferay'], {
    env: composeEnv,
    reject: false,
  });

  if (composePs.ok && composePs.stdout.trim() !== '') {
    const containerId = composePs.stdout.trim().split(/\s+/)[0] ?? '';
    if (containerId !== '') {
      return {kind: 'compose', containerId};
    }
  }

  for (const candidateName of [`${composeProjectName}-liferay`, 'liferay']) {
    const dockerPs = await runDocker(
      ['ps', '-q', '--filter', `name=^/${candidateName}$`, '--filter', 'status=running'],
      {env: process.env, reject: false},
    );
    if (dockerPs.ok && dockerPs.stdout.trim() !== '') {
      const containerId = dockerPs.stdout.trim().split(/\s+/)[0] ?? '';
      if (containerId !== '') {
        return {kind: 'docker', containerId};
      }
    }
  }

  return null;
}
