import fs from 'node:fs';
import path from 'node:path';

export type ProjectType = 'ldev-native' | 'blade-workspace' | 'unknown';

export type ProjectDetection = {
  type: ProjectType;
  root: string | null;
};

export function detectProjectType(startDir: string): ProjectType {
  return detectProject(startDir).type;
}

/**
 * Walk upward from `startDir`, applying this precedence rule:
 *
 * 1. `ldev-native` is checked first at every level and wins immediately when found.
 *    This means an ldev-native project nested inside a Blade Workspace directory
 *    will be detected as `ldev-native` when you start from inside the native project.
 *
 * 2. `blade-workspace` is recorded as a candidate on first match but does not stop
 *    the walk. The walk continues upward to give any ancestor ldev-native a chance
 *    to win. If no ldev-native is found, the first blade-workspace candidate is returned.
 *
 * 3. The rule is directory-position-based, not capability-aware. Starting from
 *    the blade-workspace root returns `blade-workspace` even if an ldev-native
 *    subdirectory exists under it. Starting from inside the ldev-native subdirectory
 *    returns `ldev-native`.
 *
 * This is the intended final heuristic. Changing it to a capability-aware or
 * marker-aware rule is a non-goal unless a concrete use case requires it.
 */
export function detectProject(startDir: string): ProjectDetection {
  let current = path.resolve(startDir);
  let workspaceCandidate: string | null = null;

  for (;;) {
    if (isLdevNativeProject(current)) {
      return {
        type: 'ldev-native',
        root: current,
      };
    }

    if (!workspaceCandidate && isBladeWorkspace(current)) {
      workspaceCandidate = current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      if (workspaceCandidate) {
        return {
          type: 'blade-workspace',
          root: workspaceCandidate,
        };
      }

      return {
        type: 'unknown',
        root: null,
      };
    }

    current = parent;
  }
}

function isLdevNativeProject(rootDir: string): boolean {
  const dockerDir = path.join(rootDir, 'docker');
  const liferayDir = path.join(rootDir, 'liferay');
  const dockerComposeFile = path.join(dockerDir, 'docker-compose.yml');

  return fs.existsSync(dockerComposeFile) && fs.existsSync(liferayDir) && fs.statSync(liferayDir).isDirectory();
}

function isBladeWorkspace(rootDir: string): boolean {
  const gradleProperties = path.join(rootDir, 'gradle.properties');
  const settingsGradle = path.join(rootDir, 'settings.gradle');

  if (!fs.existsSync(gradleProperties) || !fs.existsSync(settingsGradle)) {
    return false;
  }

  const gradleContent = fs.readFileSync(gradleProperties, 'utf8');

  return gradleContent.includes('liferay.workspace.product=');
}
