import fs from 'node:fs';
import path from 'node:path';

export type RepoPaths = {
  repoRoot: string | null;
  dockerDir: string | null;
  liferayDir: string | null;
  dockerEnvFile: string | null;
  liferayProfileFile: string | null;
};

export function detectRepoPaths(startDir: string): RepoPaths {
  let current = path.resolve(startDir);

  while (true) {
    const dockerDir = path.join(current, 'docker');
    const liferayDir = path.join(current, 'liferay');
    const dockerComposeFile = path.join(dockerDir, 'docker-compose.yml');

    if (fs.existsSync(dockerComposeFile) && fs.existsSync(liferayDir) && fs.statSync(liferayDir).isDirectory()) {
      const dockerEnvFile = path.join(dockerDir, '.env');
      const liferayProfileFile = path.join(current, '.liferay-cli.yml');

      return {
        repoRoot: current,
        dockerDir,
        liferayDir,
        dockerEnvFile: fs.existsSync(dockerEnvFile) ? dockerEnvFile : null,
        liferayProfileFile: fs.existsSync(liferayProfileFile) ? liferayProfileFile : null,
      };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return {
        repoRoot: null,
        dockerDir: null,
        liferayDir: null,
        dockerEnvFile: null,
        liferayProfileFile: null,
      };
    }
    current = parent;
  }
}
