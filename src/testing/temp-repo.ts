import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createTempRepo(): string {
  const repoRoot = createTempDir();
  fs.mkdirSync(path.join(repoRoot, 'docker'), {recursive: true});
  fs.mkdirSync(path.join(repoRoot, 'liferay'), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  return repoRoot;
}

export function createTempDir(prefix = 'dev-cli-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
