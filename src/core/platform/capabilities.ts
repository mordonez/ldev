import os from 'node:os';

import {isDockerAvailable, isDockerComposeAvailable} from './docker.js';
import {getRepoRoot} from './git.js';
import {runProcess} from './process.js';

export type PlatformOs = 'linux' | 'macos' | 'windows';

export type PlatformCapabilities = {
  os: PlatformOs;
  hasGit: boolean;
  hasBlade: boolean;
  hasDocker: boolean;
  hasDockerCompose: boolean;
  hasJava: boolean;
  hasNode: boolean;
  hasLcp: boolean;
  supportsWorktrees: boolean;
  supportsBtrfsSnapshots: boolean;
};

export async function detectCapabilities(
  cwd: string,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<PlatformCapabilities> {
  const detectedOs = detectOs();
  const hasGit = (await runProcess('git', ['--version'])).ok;
  const hasBlade = (await runProcess('blade', ['version'])).ok;
  const hasDocker = await isDockerAvailable(options?.processEnv);
  const hasDockerCompose = await isDockerComposeAvailable(options?.processEnv);
  const hasJava = (await runProcess('java', ['-version'])).ok;
  const hasNode = true;
  const hasLcp = (await runProcess('lcp', ['version'])).ok;
  const repoRoot = await getRepoRoot(cwd);

  return {
    os: detectedOs,
    hasGit,
    hasBlade,
    hasDocker,
    hasDockerCompose,
    hasJava,
    hasNode,
    hasLcp,
    supportsWorktrees: Boolean(repoRoot && hasGit),
    supportsBtrfsSnapshots: detectedOs === 'linux',
  };
}

function detectOs(): PlatformOs {
  switch (os.platform()) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}
