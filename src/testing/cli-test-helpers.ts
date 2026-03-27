import fs from 'fs-extra';
import path from 'node:path';

import {vi} from 'vitest';

import {createTempDir} from './temp-repo.js';

export async function createLiferayCliRepoFixture(prefix: string): Promise<string> {
  const repoRoot = createTempDir(prefix);
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'LIFERAY_CLI_URL=http://localhost:8080\nLIFERAY_CLI_OAUTH2_CLIENT_ID=client-id\nLIFERAY_CLI_OAUTH2_CLIENT_SECRET=client-secret\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');

  return repoRoot;
}

export function captureProcessOutput(): {
  stdout: () => string;
  stderr: () => string;
  restore: () => void;
} {
  let stdout = '';
  let stderr = '';

  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  });

  return {
    stdout: () => stdout,
    stderr: () => stderr,
    restore: () => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}
