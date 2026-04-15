/**
 * Sync strategy for Liferay ADTs (Application Display Templates).
 * Implements artifact-specific logic for ADT synchronization.
 */

import fs from 'fs-extra';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {CliError} from '../../../../core/errors.js';
import {createLiferayGateway, type LiferayGateway} from '../../liferay-gateway.js';
import type {ResolvedSite} from '../../inventory/liferay-site-resolver.js';
import {LiferayErrors} from '../../errors/index.js';
import {runLiferayResourceListAdts} from '../liferay-resource-list-adts.js';
import {resolveAdtFile} from '../liferay-resource-paths.js';
import {fetchAdtResourceClassNameId, fetchClassNameIdForValue} from '../liferay-resource-shared.js';
import {localizedMap, sha256, type ResourceSyncDependencies} from '../liferay-resource-sync-shared.js';
import {matchesAdtRow} from '../../liferay-identifiers.js';
import type {LocalArtifact, RemoteArtifact, SyncStrategy} from '../sync-engine.js';

type AdtLocalData = {
  filePath: string;
};

type AdtRemoteData = {
  templateId: string;
  templateKey?: string;
  widgetType: string;
  className: string;
};

type AdtSyncOptions = {
  key: string;
  widgetType: string;
  className: string;
  file?: string;
};

/**
 * ADT sync strategy implementation.
 * Note: Global-site fallback is handled by the facade before calling the engine.
 * This strategy operates on a single pre-determined site.
 */
export const adtSyncStrategy: SyncStrategy<AdtLocalData, AdtRemoteData> = {
  async resolveLocal(
    config: AppConfig,
    site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<AdtLocalData> | null> {
    const opts = options as AdtSyncOptions;

    try {
      const filePath = await resolveAdtFile(config, opts.key, opts.widgetType, opts.file);
      const script = await fs.readFile(filePath, 'utf8');
      // ADTs do not normalize like templates; use raw content for hashing
      const contentHash = sha256(script);

      return {
        id: opts.key,
        normalizedContent: script,
        contentHash,
        data: {filePath},
      };
    } catch (error) {
      if (error instanceof CliError && error.code === 'LIFERAY_RESOURCE_FILE_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  },

  async findRemote(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<AdtLocalData>,
    options: Record<string, unknown>,
    dependencies?: ResourceSyncDependencies,
  ): Promise<RemoteArtifact<AdtRemoteData> | null> {
    const opts = options as AdtSyncOptions;

    // List ADTs for this site, widget type, and class name
    const adts = await runLiferayResourceListAdts(
      config,
      {
        site: site.friendlyUrlPath,
        widgetType: opts.widgetType,
        className: opts.className,
        includeScript: true,
      },
      dependencies,
    );

    // Match by key (templateKey, adtName, or displayName)
    const existing = adts.find((item) => {
      return matchesAdtRow(item, opts.key);
    });

    if (!existing) {
      return null;
    }

    return {
      id: String(((existing.templateKey ?? existing.templateId) as string | undefined) ?? ''),
      name: opts.key,
      data: {
        templateId: String(existing.templateId),
        templateKey: existing.templateKey as string | undefined,
        widgetType: existing.widgetType,
        className: existing.className,
      },
    };
  },

  async upsert(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<AdtLocalData>,
    remoteArtifact: RemoteArtifact<AdtRemoteData> | null,
    options: Record<string, unknown>,
    dependencies?: ResourceSyncDependencies,
  ): Promise<RemoteArtifact<AdtRemoteData>> {
    const opts = options as AdtSyncOptions;
    const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);

    if (!remoteArtifact) {
      // Create new ADT
      const classNameId = await fetchClassNameIdForValue(config, opts.className, dependencies);
      const resourceClassNameId = await fetchAdtResourceClassNameId(config, dependencies);

      const created = await postFormAsResource<Record<string, unknown>>(
        gateway,
        '/api/jsonws/ddm.ddmtemplate/add-template',
        {
          externalReferenceCode: opts.key,
          groupId: String(site.id),
          classNameId: String(classNameId),
          classPK: '0', // ADTs have no structure binding
          resourceClassNameId: String(resourceClassNameId),
          nameMap: localizedMap(opts.key),
          descriptionMap: localizedMap(''),
          type: 'display',
          mode: '',
          language: 'ftl',
          script: localArtifact.normalizedContent,
        },
        'adt-create',
      );

      const createdId = String(created.templateKey ?? created.templateId ?? '');

      return {
        id: createdId,
        name: opts.key,
        data: {
          templateId: createdId,
          templateKey: created.templateKey as string | undefined,
          widgetType: opts.widgetType,
          className: opts.className,
        },
      };
    }

    // Update existing ADT
    const ddmTemplate = await getJsonAsResource<Record<string, unknown>>(
      gateway,
      `/api/jsonws/ddm.ddmtemplate/get-template?templateId=${remoteArtifact.data.templateId}`,
      'adt-ddm-get',
    );

    await postFormAsResource(
      gateway,
      '/api/jsonws/ddm.ddmtemplate/update-template',
      {
        templateId: remoteArtifact.data.templateId,
        classPK: String(ddmTemplate.classPK ?? '0'),
        nameMap: localizedMap(opts.key),
        descriptionMap: localizedMap(''),
        type: 'display',
        mode: '',
        language: 'ftl',
        script: localArtifact.normalizedContent,
        cacheable: 'false',
      },
      'adt-update',
    );

    return remoteArtifact;
  },

  async verify(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<AdtLocalData>,
    remoteArtifact: RemoteArtifact<AdtRemoteData>,
    dependencies?: ResourceSyncDependencies,
  ): Promise<void> {
    // Re-list ADTs to verify the runtime script matches local
    const adts = await runLiferayResourceListAdts(
      config,
      {
        site: site.friendlyUrlPath,
        widgetType: remoteArtifact.data.widgetType,
        className: remoteArtifact.data.className,
        includeScript: true,
      },
      dependencies,
    );

    const runtime = adts.find((item) => String(item.templateId) === String(remoteArtifact.data.templateId));

    if (runtime?.script) {
      const runtimeHash = sha256(runtime.script);
      if (runtimeHash !== localArtifact.contentHash) {
        throw LiferayErrors.resourceError(`Hash mismatch ADT '${remoteArtifact.name}'`);
      }
    }
  },
};

async function getJsonAsResource<T>(gateway: LiferayGateway, path: string, label: string): Promise<T> {
  try {
    return await gateway.getJson<T>(path, label);
  } catch (error) {
    rethrowGatewayAsResourceError(error);
  }
}

async function postFormAsResource<T>(
  gateway: LiferayGateway,
  path: string,
  form: Record<string, string>,
  label: string,
): Promise<T> {
  try {
    return await gateway.postForm<T>(path, form, label);
  } catch (error) {
    rethrowGatewayAsResourceError(error);
  }
}

function rethrowGatewayAsResourceError(error: unknown): never {
  if (error instanceof CliError && error.code === 'LIFERAY_GATEWAY_ERROR') {
    throw LiferayErrors.resourceError(error.message);
  }

  throw error;
}
