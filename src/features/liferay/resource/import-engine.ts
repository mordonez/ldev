/**
 * Generic import engine for artifact import.
 *
 * Extracts common import flow:
 * 1. resolveSite - locate target site
 * 2. resolveLocalArtifact - find local file/resource
 * 3. readLocal - read and normalize local content
 * 4. findRemote - lookup remote existing artifact
 * 5. upsert - create or update remote
 * 6. verifyRemote - hash verification
 *
 * Strategies implement artifact-specific logic; engine orchestrates flow.
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import type {ResolvedSite} from '../portal/site-resolution.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResourceImportDependencies, ImportArtifactResult} from './liferay-resource-artifact-shared.js';

/**
 * Local artifact representation after reading.
 */
export type LocalArtifact<T = Record<string, unknown>> = {
  /** Artifact identifier (key, id, name, etc.) */
  id: string;
  /** Normalized content for hashing */
  normalizedContent: string;
  /** SHA256 hash of normalized content */
  contentHash: string;
  /** Raw artifact data (file path, structured content, etc.) */
  data: T;
};

/**
 * Remote artifact representation after lookup.
 */
export type RemoteArtifact<T = Record<string, unknown>> = {
  /** Artifact identifier in remote system */
  id: string;
  /** Artifact name/key as stored remotely */
  name: string;
  /** SHA256 of remote content (if verifiable) */
  contentHash?: string;
  /** Raw remote artifact data */
  data: T;
};

/**
 * Strategy for importing a specific artifact type.
 * Implement for templates, ADTs, structures, etc.
 */
export type ImportStrategy<Local = never, Remote = never> = {
  /**
   * Resolve local artifact from filesystem or config.
   * @returns LocalArtifact or null if not found
   */
  resolveLocal(
    config: AppConfig,
    site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<Local> | null>;

  /**
   * Find existing remote artifact.
   * @returns RemoteArtifact or null if not found
   */
  findRemote(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<Local>,
    options: Record<string, unknown>,
    dependencies?: ResourceImportDependencies,
  ): Promise<RemoteArtifact<Remote> | null>;

  /**
   * Create or update remote artifact.
   * @returns RemoteArtifact with id and name after upsert
   */
  upsert(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<Local>,
    remoteArtifact: RemoteArtifact<Remote> | null,
    options: Record<string, unknown>,
    dependencies?: ResourceImportDependencies,
  ): Promise<RemoteArtifact<Remote>>;

  /**
   * Check an existing remote artifact without applying the final mutation.
   * Strategies only need this when check-only requires artifact-specific
   * validation beyond verify, such as migration dry-runs.
   */
  preview?(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<Local>,
    remoteArtifact: RemoteArtifact<Remote>,
    options: Record<string, unknown>,
    dependencies?: ResourceImportDependencies,
  ): Promise<RemoteArtifact<Remote>>;

  /**
   * Verify remote artifact matches local (hash check, etc.).
   * Throw if verification fails.
   */
  verify(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<Local>,
    remoteArtifact: RemoteArtifact<Remote>,
    dependencies?: ResourceImportDependencies,
  ): Promise<void>;
};

/**
 * Options passed to ImportEngine.
 */
export type ImportEngineOptions = {
  /** Dry-run mode: check without creating/updating */
  checkOnly?: boolean;
  /** Create artifact if it doesn't exist remotely */
  createMissing?: boolean;
  /** User-provided options (strategy-specific) */
  strategyOptions?: Record<string, unknown>;
};

/**
 * Generic import engine result.
 */
export type ImportEngineResult = ImportArtifactResult;

export type ImportArtifactOutcome<Local = never, Remote = never> = {
  result: ImportEngineResult;
  localArtifact: LocalArtifact<Local>;
  initialRemoteArtifact: RemoteArtifact<Remote> | null;
  changedRemoteArtifact: RemoteArtifact<Remote> | null;
  verifiedRemoteArtifact: RemoteArtifact<Remote> | null;
};

/**
 * Orchestrate artifact import using a strategy.
 */
export async function runImportArtifact<Local = never, Remote = never>(
  config: AppConfig,
  site: ResolvedSite,
  strategy: ImportStrategy<Local, Remote>,
  options: ImportEngineOptions,
  dependencies?: ResourceImportDependencies,
): Promise<ImportEngineResult> {
  return (await runImportArtifactDetailed(config, site, strategy, options, dependencies)).result;
}

/**
 * Orchestrate artifact import and expose lifecycle artifacts to callers
 * that need artifact-specific result fields.
 */
export async function runImportArtifactDetailed<Local = never, Remote = never>(
  config: AppConfig,
  site: ResolvedSite,
  strategy: ImportStrategy<Local, Remote>,
  options: ImportEngineOptions,
  dependencies?: ResourceImportDependencies,
): Promise<ImportArtifactOutcome<Local, Remote>> {
  const strategyOpts = options.strategyOptions ?? {};

  // 1. Resolve local artifact
  const localArtifact = await strategy.resolveLocal(config, site, strategyOpts);
  if (!localArtifact) {
    throw LiferayErrors.resourceFileNotFound('local artifact');
  }

  // 2. Find remote artifact
  const remoteArtifact = await strategy.findRemote(config, site, localArtifact, strategyOpts, dependencies);

  // 3. If missing and not allowed, preserve legacy import behaviour.
  if (!remoteArtifact && !options.createMissing) {
    throw LiferayErrors.resourceError(
      `Artifact '${localArtifact.id}' does not exist and create-missing is not enabled.`,
    );
  }

  // 4. If missing and check-only (only reachable when createMissing=true)
  if (!remoteArtifact && options.checkOnly) {
    return {
      result: {
        status: 'checked_missing',
        id: '',
        name: localArtifact.id,
        extra: '',
      },
      localArtifact,
      initialRemoteArtifact: null,
      changedRemoteArtifact: null,
      verifiedRemoteArtifact: null,
    };
  }

  // 5. Preview or upsert
  const changedRemoteArtifact = options.checkOnly
    ? remoteArtifact && strategy.preview
      ? await strategy.preview(config, site, localArtifact, remoteArtifact, strategyOpts, dependencies)
      : null
    : await strategy.upsert(config, site, localArtifact, remoteArtifact, strategyOpts, dependencies);

  // 6. Verify after real mutations. In check-only mode, strategies validate the
  // request shape through preview/upsert where needed; hashing the unchanged
  // remote artifact against a modified local file would make every intended
  // template/ADT/script edit look like a failed preflight.
  const verifiedRemote = await strategy.findRemote(config, site, localArtifact, strategyOpts, dependencies);
  if (verifiedRemote && !options.checkOnly) {
    await strategy.verify(config, site, localArtifact, verifiedRemote, dependencies);
  }

  const finalStatus = options.checkOnly ? 'checked' : remoteArtifact ? 'updated' : 'created';

  return {
    result: {
      status: finalStatus,
      id: verifiedRemote?.id ?? changedRemoteArtifact?.id ?? localArtifact.id,
      name: localArtifact.id,
      extra: '',
    },
    localArtifact,
    initialRemoteArtifact: remoteArtifact,
    changedRemoteArtifact,
    verifiedRemoteArtifact: verifiedRemote,
  };
}
