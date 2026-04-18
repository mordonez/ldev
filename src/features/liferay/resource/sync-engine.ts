/**
 * Generic sync engine for artifact synchronization.
 *
 * Extracts common sync flow:
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
import type {ResolvedSite} from '../inventory/liferay-site-resolver.js';
import {LiferayErrors} from '../errors/index.js';
import type {ResourceSyncDependencies, ResourceSyncResult} from './liferay-resource-sync-shared.js';

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
 * Strategy for syncing a specific artifact type.
 * Implement for templates, ADTs, structures, etc.
 */
export type SyncStrategy<Local = never, Remote = never> = {
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
    dependencies?: ResourceSyncDependencies,
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
    dependencies?: ResourceSyncDependencies,
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
    dependencies?: ResourceSyncDependencies,
  ): Promise<void>;
};

/**
 * Options passed to SyncEngine.
 */
export type SyncEngineOptions = {
  /** Dry-run mode: check without creating/updating */
  checkOnly?: boolean;
  /** Create artifact if it doesn't exist remotely */
  createMissing?: boolean;
  /** User-provided options (strategy-specific) */
  strategyOptions?: Record<string, unknown>;
};

/**
 * Generic sync engine result.
 */
export type SyncEngineResult = ResourceSyncResult;

/**
 * Orchestrate artifact synchronization using a strategy.
 */
export async function syncArtifact<Local = never, Remote = never>(
  config: AppConfig,
  site: ResolvedSite,
  strategy: SyncStrategy<Local, Remote>,
  options: SyncEngineOptions,
  dependencies?: ResourceSyncDependencies,
): Promise<SyncEngineResult> {
  const strategyOpts = options.strategyOptions ?? {};

  // 1. Resolve local artifact
  const localArtifact = await strategy.resolveLocal(config, site, strategyOpts);
  if (!localArtifact) {
    throw LiferayErrors.resourceFileNotFound('local artifact');
  }

  // 2. Find remote artifact
  const remoteArtifact = await strategy.findRemote(config, site, localArtifact, strategyOpts, dependencies);

  // 3. If missing and not allowed, preserve legacy sync semantics.
  if (!remoteArtifact && !options.createMissing) {
    throw LiferayErrors.resourceError(
      `Artifact '${localArtifact.id}' does not exist and create-missing is not enabled.`,
    );
  }

  // 4. If missing and check-only (only reachable when createMissing=true)
  if (!remoteArtifact && options.checkOnly) {
    return {
      status: 'checked_missing',
      id: '',
      name: localArtifact.id,
      extra: '',
    };
  }

  // 5. Upsert
  if (!options.checkOnly) {
    await strategy.upsert(config, site, localArtifact, remoteArtifact, strategyOpts, dependencies);
  }

  // 6. Verify (always, even in check-only mode for hash validation)
  const verifiedRemote = await strategy.findRemote(config, site, localArtifact, strategyOpts, dependencies);
  if (verifiedRemote) {
    await strategy.verify(config, site, localArtifact, verifiedRemote, dependencies);
  }

  const finalStatus = options.checkOnly ? 'checked' : remoteArtifact ? 'updated' : 'created';

  return {
    status: finalStatus,
    id: verifiedRemote?.id ?? localArtifact.id,
    name: localArtifact.id,
    extra: '',
  };
}
