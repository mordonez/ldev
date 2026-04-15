/**
 * Sync strategy for Liferay templates.
 * Implements artifact-specific logic for template synchronization.
 */

import fs from 'fs-extra';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {CliError} from '../../../../core/errors.js';
import type {ResolvedSite} from '../../inventory/liferay-site-resolver.js';
import {runLiferayInventoryTemplates} from '../../inventory/liferay-inventory-templates.js';
import {runLiferayResourceGetTemplate} from '../liferay-resource-get-template.js';
import {fetchStructureByKey} from '../liferay-resource-sync-structure-shared.js';
import {resolveTemplateFile, resolveSiteToken} from '../liferay-resource-paths.js';
import {fetchStructureTemplateClassIds} from '../liferay-resource-shared.js';
import {normalizeLiferayTemplateScript} from '../liferay-resource-template-normalize.js';
import {
  authedGetJson,
  ensureString,
  localizedMap,
  sha256,
  type ResourceSyncDependencies,
  postFormCandidates,
} from '../liferay-resource-sync-shared.js';
import {matchesInventoryTemplate} from '../../liferay-identifiers.js';
import type {LocalArtifact, RemoteArtifact, SyncStrategy} from '../sync-engine.js';

type TemplateLocalData = {
  filePath: string;
};

type TemplateRemoteData = {
  templateId: string;
  templateKey?: string;
  externalReferenceCode?: string;
  classPK?: string;
  script?: string;
};

type TemplateSyncOptions = {
  key: string;
  file?: string;
  structureKey?: string;
};

/**
 * Template sync strategy implementation.
 */
export const templateSyncStrategy: SyncStrategy<TemplateLocalData, TemplateRemoteData> = {
  async resolveLocal(
    config: AppConfig,
    site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<TemplateLocalData> | null> {
    const opts = options as TemplateSyncOptions;
    const siteToken = resolveSiteToken(site.friendlyUrlPath);

    try {
      const filePath = await resolveTemplateFile(config, siteToken, opts.key, opts.file);
      const script = await fs.readFile(filePath, 'utf8');
      const normalizedContent = normalizeLiferayTemplateScript(script);

      return {
        id: opts.key,
        normalizedContent,
        contentHash: sha256(normalizedContent),
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
    localArtifact: LocalArtifact<TemplateLocalData>,
    options: Record<string, unknown>,
    dependencies?: ResourceSyncDependencies,
  ): Promise<RemoteArtifact<TemplateRemoteData> | null> {
    const opts = options as TemplateSyncOptions;
    const inventoryTemplates = await runLiferayInventoryTemplates(config, {site: site.friendlyUrlPath}, dependencies);

    let structureIdFilter = '';
    if (opts.structureKey) {
      const structure = await fetchStructureByKey(config, site.id, opts.structureKey, dependencies);
      structureIdFilter = String(structure.id ?? '');
    }

    const inventoryExisting = inventoryTemplates.find((item) => {
      if (!matchesInventoryTemplate(item, opts.key)) {
        return false;
      }
      if (structureIdFilter !== '' && String(item.contentStructureId) !== structureIdFilter) {
        return false;
      }
      return true;
    });

    // Try direct DDM template lookup
    const {classNameId} = await fetchStructureTemplateClassIds(config, dependencies);
    const directDdmTemplate = await tryGetDdmTemplateByKey(
      config,
      site.id,
      String(classNameId),
      opts.key,
      dependencies,
    );

    const existing = directDdmTemplate
      ? structureIdFilter === '' || String(directDdmTemplate.classPK ?? '') === structureIdFilter
        ? directDdmTemplate
        : null
      : null;

    if (existing) {
      return {
        id: String(((existing.templateKey ?? existing.templateId) as string | undefined) ?? ''),
        name: String(((existing.templateKey ?? existing.templateId) as string | undefined) ?? opts.key),
        contentHash: localArtifact.contentHash, // Will verify in verify() step
        data: {
          templateId: ensureString(existing.templateId as string | undefined, 'templateId'),
          templateKey: existing.templateKey as string | undefined,
          externalReferenceCode: existing.externalReferenceCode as string | undefined,
          classPK: String((existing.classPK as string | undefined) ?? ''),
          script: existing.script as string | undefined,
        },
      };
    }

    // Check inventory as fallback
    if (inventoryExisting) {
      return {
        id: String(inventoryExisting.id ?? ''),
        name: inventoryExisting.name,
        contentHash: localArtifact.contentHash,
        data: {
          templateId: inventoryExisting.id,
          externalReferenceCode: inventoryExisting.externalReferenceCode,
        },
      };
    }

    return null;
  },

  async upsert(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<TemplateLocalData>,
    remoteArtifact: RemoteArtifact<TemplateRemoteData> | null,
    options: Record<string, unknown>,
    dependencies?: ResourceSyncDependencies,
  ): Promise<RemoteArtifact<TemplateRemoteData>> {
    const opts = options as TemplateSyncOptions;

    if (!remoteArtifact) {
      // Create new template
      if (!opts.structureKey) {
        throw new CliError('To create a template, provide --structure-key.', {
          code: 'LIFERAY_RESOURCE_ERROR',
        });
      }

      const {classNameId, resourceClassNameId} = await fetchStructureTemplateClassIds(config, dependencies);
      const structure = await fetchStructureByKey(config, site.id, opts.structureKey, dependencies);

      const created = await postFormCandidates<Record<string, unknown>>(
        config,
        '/api/jsonws/ddm.ddmtemplate/add-template',
        [
          {
            externalReferenceCode: opts.key,
            groupId: String(site.id),
            classNameId: String(classNameId),
            classPK: String(structure.id ?? ''),
            resourceClassNameId: String(resourceClassNameId),
            nameMap: localizedMap(opts.key),
            descriptionMap: localizedMap(''),
            type: 'display',
            mode: '',
            language: 'ftl',
            script: localArtifact.normalizedContent,
          },
        ],
        'template-create',
        dependencies,
      );

      const createdId = String(created.templateKey ?? created.templateId ?? '');

      return {
        id: createdId,
        name: opts.key,
        data: {
          templateId: createdId,
          externalReferenceCode: opts.key,
        },
      };
    }

    // Update existing template
    const templateId = ensureString(remoteArtifact.data.templateId, 'templateId');
    const classPk = String(remoteArtifact.data.classPK ?? '0');

    await postFormCandidates(
      config,
      '/api/jsonws/ddm.ddmtemplate/update-template',
      [
        {
          templateId,
          classPK: classPk,
          nameMap: localizedMap(opts.key),
          descriptionMap: localizedMap(''),
          type: 'display',
          mode: '',
          language: 'ftl',
          script: localArtifact.normalizedContent,
          cacheable: 'false',
        },
      ],
      'template-update',
      dependencies,
    );

    return remoteArtifact;
  },

  async verify(
    config: AppConfig,
    site: ResolvedSite,
    localArtifact: LocalArtifact<TemplateLocalData>,
    remoteArtifact: RemoteArtifact<TemplateRemoteData>,
    dependencies?: ResourceSyncDependencies,
  ): Promise<void> {
    // Get runtime template from API
    const runtime = await runLiferayResourceGetTemplate(
      config,
      {site: site.friendlyUrlPath, id: remoteArtifact.id},
      dependencies,
    );

    const normalizedRuntimeScript = normalizeLiferayTemplateScript(runtime.templateScript || '');
    const runtimeHash = normalizedRuntimeScript !== '' ? sha256(normalizedRuntimeScript) : '';

    // Verify hash match
    if (runtimeHash !== '' && runtimeHash !== localArtifact.contentHash) {
      throw new CliError(`Hash mismatch template '${remoteArtifact.name}'`, {
        code: 'LIFERAY_RESOURCE_ERROR',
      });
    }
  },
};

/**
 * Helper: Try to fetch DDM template by key from server.
 * Returns null if not found (swallows 404-like errors).
 */
async function tryGetDdmTemplateByKey(
  config: AppConfig,
  siteId: number,
  classNameId: string,
  templateKey: string,
  dependencies?: ResourceSyncDependencies,
): Promise<Record<string, unknown> | null> {
  try {
    return await authedGetJson<Record<string, unknown>>(
      config,
      `/api/jsonws/ddm.ddmtemplate/get-template?groupId=${siteId}&classNameId=${classNameId}&templateKey=${templateKey}`,
      'template-lookup',
      dependencies,
    );
  } catch (error) {
    if (error instanceof CliError && error.code === 'LIFERAY_RESOURCE_ERROR') {
      return null;
    }
    throw error;
  }
}
