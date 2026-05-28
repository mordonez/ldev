/**
 * Import strategy for Liferay templates.
 * Implements artifact-specific logic for template import.
 */

import fs from 'fs-extra';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {CliError} from '../../../../core/errors.js';
import {createLiferayGateway, type LiferayGateway} from '../../liferay-gateway.js';
import type {ResolvedSite} from '../../portal/site-resolution.js';
import {runLiferayInventoryTemplates} from '../../inventory/liferay-inventory-templates.js';
import {LiferayErrors} from '../../errors/index.js';
import {runLiferayResourceGetTemplate} from '../liferay-resource-get-template.js';
import {resolveTemplateFile, resolveSiteToken} from '../../portal/artifact-paths.js';
import {isGatewayStatus, rethrowGatewayAsResourceError} from './shared.js';
import {
  fetchStructureTemplateClassIds,
  listDdmTemplates,
  type DdmTemplatePayload,
  type ResolvedResourceSite,
} from '../liferay-resource-shared.js';
import {normalizeLiferayTemplateScript} from '../liferay-resource-template-normalize.js';
import {
  ensureString,
  localizedMap,
  sha256,
  type ResourceDependencies,
  postFormCandidates,
} from '../liferay-resource-artifact-shared.js';
import {matchesDdmTemplate, matchesInventoryTemplate} from '../../liferay-identifiers.js';
import type {LocalArtifact, RemoteArtifact, ImportStrategy} from '../import-engine.js';

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

type TemplateImportOptions = {
  key: string;
  file?: string;
  structureKey?: string;
};

/**
 * Template import strategy implementation.
 */
export const templateImportStrategy: ImportStrategy<TemplateLocalData, TemplateRemoteData> = {
  async resolveLocal(
    config: AppConfig,
    site: ResolvedSite,
    options: Record<string, unknown>,
  ): Promise<LocalArtifact<TemplateLocalData> | null> {
    const opts = options as TemplateImportOptions;
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
    dependencies?: ResourceDependencies,
  ): Promise<RemoteArtifact<TemplateRemoteData> | null> {
    const opts = options as TemplateImportOptions;
    const inventoryTemplates = await runLiferayInventoryTemplates(config, {site: site.friendlyUrlPath}, dependencies);

    let structureIdFilter = '';
    if (opts.structureKey) {
      const structure = await fetchStructureByKey(config, site.id, opts.structureKey, dependencies);
      structureIdFilter = ensureString(structure.id, 'structureId');
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

    const existing = await findUpdatableDdmTemplate(
      config,
      site as ResolvedResourceSite,
      opts.key,
      structureIdFilter,
      dependencies,
    );

    if (existing) {
      if (structureIdFilter !== '' && ensureString(existing.classPK ?? '', 'classPK') !== structureIdFilter) {
        return null;
      }
      return {
        id: ensureString(existing.templateKey ?? existing.templateId, 'templateKey'),
        name: ensureString(existing.templateKey ?? existing.templateId ?? opts.key, 'templateName'),
        contentHash: localArtifact.contentHash, // Will verify in verify() step
        data: {
          templateId: ensureString(existing.templateId, 'templateId'),
          templateKey: existing.templateKey,
          externalReferenceCode: existing.externalReferenceCode,
          classPK: ensureString(existing.classPK ?? '', 'classPK'),
          script: existing.script,
        },
      };
    }

    if (inventoryExisting && isJsonWsTemplateId(inventoryExisting.id)) {
      return {
        id: String(inventoryExisting.id),
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
    dependencies?: ResourceDependencies,
  ): Promise<RemoteArtifact<TemplateRemoteData>> {
    const opts = options as TemplateImportOptions;

    if (!remoteArtifact) {
      // Create new template
      if (!opts.structureKey) {
        throw LiferayErrors.resourceError('To create a template, provide --structure-key.');
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
            classPK: ensureString(structure.id, 'structureId'),
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

      const createdId = ensureString(created.templateKey ?? created.templateId, 'templateKey');

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
    dependencies?: ResourceDependencies,
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
      throw LiferayErrors.resourceError(`Hash mismatch template '${remoteArtifact.name}'`);
    }
  },
};

function isJsonWsTemplateId(value: string): boolean {
  const numericId = Number(value);
  return Number.isFinite(numericId) && numericId > 0;
}

async function findUpdatableDdmTemplate(
  config: AppConfig,
  site: ResolvedResourceSite,
  key: string,
  structureIdFilter: string,
  dependencies?: ResourceDependencies,
): Promise<DdmTemplatePayload | null> {
  const {classNameId} = await fetchStructureTemplateClassIds(config, dependencies);
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const direct = await tryGetDdmTemplateByKey(gateway, site.id, String(classNameId), key);
  if (direct && matchesTemplateForUpdate(direct, key, structureIdFilter)) {
    return direct;
  }

  const siteTemplate = (
    await listDdmTemplates(config, site, dependencies, {
      includeCompanyFallback: false,
    })
  ).find((item) => matchesTemplateForUpdate(item, key, structureIdFilter));
  if (siteTemplate) {
    return siteTemplate;
  }

  return (
    (await listDdmTemplates(config, site, dependencies, {companyOnly: true})).find((item) =>
      matchesTemplateForUpdate(item, key, structureIdFilter),
    ) ?? null
  );
}

function matchesTemplateForUpdate(item: DdmTemplatePayload, key: string, structureIdFilter: string): boolean {
  if (!matchesDdmTemplate(item, key)) {
    return false;
  }

  return structureIdFilter === '' || ensureString(item.classPK ?? '', 'classPK') === structureIdFilter;
}

async function fetchStructureByKey(
  config: AppConfig,
  siteId: number,
  key: string,
  dependencies?: ResourceDependencies,
): Promise<Record<string, unknown>> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  return gateway.getJson<Record<string, unknown>>(
    `/o/data-engine/v2.0/sites/${siteId}/data-definitions/by-content-type/journal/by-data-definition-key/${encodeURIComponent(key)}`,
    'structure-get',
  );
}

/**
 * Helper: Try to fetch DDM template by key from server.
 * Returns null if not found (swallows 404-like errors).
 */
async function tryGetDdmTemplateByKey(
  gateway: LiferayGateway,
  siteId: number,
  classNameId: string,
  templateKey: string,
): Promise<DdmTemplatePayload | null> {
  try {
    return await gateway.getJson<DdmTemplatePayload>(
      `/api/jsonws/ddm.ddmtemplate/get-template?groupId=${siteId}&classNameId=${classNameId}&templateKey=${templateKey}`,
      'template-lookup',
    );
  } catch (error) {
    if (isGatewayStatus(error, 404)) {
      return null;
    }
    rethrowGatewayAsResourceError(error);
  }
}
