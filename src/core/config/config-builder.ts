import {resolveLiferayConfig} from '../http/config.js';
import {appConfigSchema, type AppConfig} from './schema.js';
import {resolveLiferayProfileFiles} from './liferay-profile.js';
import type {ProjectDetection} from './project-type.js';
import type {RepoPaths} from './repo-paths.js';

export function buildAppConfig(options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  repoPaths: RepoPaths;
  projectDetection?: ProjectDetection;
  dockerEnv: Record<string, string>;
  localProfile: Record<string, string>;
  profile: Record<string, string>;
}): AppConfig {
  const liferay = resolveLiferayConfig({
    processEnv: options.env,
    dockerEnv: options.dockerEnv,
    localProfile: options.localProfile,
  });
  const detectedProfileFiles = resolveLiferayProfileFiles(
    options.repoPaths.repoRoot ?? options.projectDetection?.root ?? null,
  );
  const profileFiles = {
    shared: options.repoPaths.liferayProfileFile ?? detectedProfileFiles.shared,
    local: detectedProfileFiles.local,
  };

  return appConfigSchema.parse({
    cwd: options.cwd,
    repoRoot: options.repoPaths.repoRoot ?? options.projectDetection?.root ?? null,
    dockerDir: options.repoPaths.dockerDir,
    liferayDir: options.repoPaths.liferayDir,
    files: {
      dockerEnv: options.repoPaths.dockerEnvFile,
      liferayProfile: profileFiles.shared,
      liferayLocalProfile: profileFiles.local,
    },
    liferay,
    paths: {
      structures: options.profile['paths.structures'] ?? 'liferay/resources/journal/structures',
      templates: options.profile['paths.templates'] ?? 'liferay/resources/journal/templates',
      adts: options.profile['paths.adts'] ?? 'liferay/resources/templates/application_display',
      fragments: options.profile['paths.fragments'] ?? 'liferay/fragments',
      migrations: options.profile['paths.migrations'] ?? 'liferay/resources/journal/migrations',
    },
  });
}
