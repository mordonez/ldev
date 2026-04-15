// Facade: re-exports from domain modules for backward compatibility.
// Consumers should import from deploy-shared.js as before.
export type {DeployContext} from './deploy-gradle.js';
export {
  resolveDeployContext,
  ensureGradleWrapper,
  runDeployStep,
  runGradleTask,
  resolveHeadCommit,
  writePrepareCommit,
  readPrepareCommit,
  currentArtifactCommit,
  seedBuildDockerConfigs,
  shouldRunBuildService,
  restoreTrackedServiceProperties,
} from './deploy-gradle.js';
export {
  listDeployArtifacts,
  syncArtifactsToBuildDeploy,
  collectModuleArtifacts,
  ensureDeployArtifactsFound,
} from './deploy-artifacts.js';
export {resolveDeployCacheDir, restoreArtifactsFromDeployCache, syncArtifactsToDeployCache} from './deploy-cache.js';
export {hotDeployArtifactsToRunningLiferay} from './deploy-hot.js';
