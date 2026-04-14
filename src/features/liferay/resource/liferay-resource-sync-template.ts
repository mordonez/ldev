import fs from 'fs-extra';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {expectJsonSuccess} from '../liferay-http-shared.js';
import {runLiferayInventoryTemplates} from '../inventory/liferay-inventory-templates.js';
import {runLiferayResourceGetTemplate} from './liferay-resource-get-template.js';
import {fetchStructureByKey} from './liferay-resource-sync-structure-shared.js';
import {resolveTemplateFile, resolveSiteToken} from './liferay-resource-paths.js';
import {fetchStructureTemplateClassIds, resolveResourceSite} from './liferay-resource-shared.js';
import {normalizeLiferayTemplateScript} from './liferay-resource-template-normalize.js';
import {
  authedGetJson,
  authedPostForm,
  ensureString,
  localizedMap,
  normalizeSyncStatus,
  sha256,
  type ResourceSyncDependencies,
  type ResourceSyncResult,
} from './liferay-resource-sync-shared.js';

export type LiferayResourceSyncTemplateResult = ResourceSyncResult & {
  templateFile: string;
  siteId: number;
  siteFriendlyUrl: string;
};

export async function runLiferayResourceSyncTemplate(
  config: AppConfig,
  options: {
    site?: string;
    key: string;
    file?: string;
    structureKey?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncTemplateResult> {
  const site = await resolveResourceSite(config, options.site ?? '/global', dependencies);
  const siteToken = resolveSiteToken(site.friendlyUrlPath);
  const templateFile = await resolveTemplateFile(config, siteToken, options.key, options.file);
  const script = await fs.readFile(templateFile, 'utf8');
  const normalizedLocalScript = normalizeLiferayTemplateScript(script);
  const localSha = sha256(normalizedLocalScript);
  const inventoryTemplates = await runLiferayInventoryTemplates(config, {site: site.friendlyUrlPath}, dependencies);

  let structureIdFilter = '';
  if (options.structureKey) {
    const structure = await fetchStructureByKey(config, site.id, options.structureKey, dependencies);
    structureIdFilter = String(structure.id ?? '');
  }

  const inventoryExisting = inventoryTemplates.find((item) => {
    if (![item.id, item.externalReferenceCode, item.name].includes(options.key)) {
      return false;
    }
    if (structureIdFilter !== '' && String(item.contentStructureId) !== structureIdFilter) {
      return false;
    }
    return true;
  });

  const {classNameId, resourceClassNameId} = await fetchStructureTemplateClassIds(config, dependencies);
  const directDdmTemplate =
    (await tryGetDdmTemplateByKey(config, site.id, classNameId, options.key, dependencies)) ??
    (inventoryExisting
      ? await tryGetDdmTemplateByKey(config, site.id, classNameId, inventoryExisting.id, dependencies)
      : null);

  const existing =
    directDdmTemplate && (structureIdFilter === '' || String(directDdmTemplate.classPK ?? '') === structureIdFilter)
      ? directDdmTemplate
      : null;

  if (!existing && !inventoryExisting) {
    if (!options.createMissing) {
      throw new CliError(`Template '${options.key}' does not exist and create-missing is not enabled.`, {
        code: 'LIFERAY_RESOURCE_ERROR',
      });
    }
    if (options.checkOnly) {
      return {
        status: 'checked_missing',
        id: '',
        name: options.key,
        extra: '',
        templateFile,
        siteId: site.id,
        siteFriendlyUrl: site.friendlyUrlPath,
      };
    }
    if (structureIdFilter === '') {
      throw new CliError('To create a template, provide --structure-key.', {
        code: 'LIFERAY_RESOURCE_ERROR',
      });
    }

    const created = await authedPostForm<Record<string, unknown>>(
      config,
      '/api/jsonws/ddm.ddmtemplate/add-template',
      {
        externalReferenceCode: options.key,
        groupId: String(site.id),
        classNameId: String(classNameId),
        classPK: structureIdFilter,
        resourceClassNameId: String(resourceClassNameId),
        nameMap: localizedMap(options.key),
        descriptionMap: localizedMap(''),
        type: 'display',
        mode: '',
        language: 'ftl',
        script,
      },
      dependencies,
    );
    const success = await expectJsonSuccess(created, 'template-create', 'LIFERAY_RESOURCE_ERROR');
    const id = String(success.data?.templateKey ?? success.data?.templateId ?? '');

    return {
      status: 'created',
      id,
      name: options.key,
      extra: '',
      templateFile,
      siteId: site.id,
      siteFriendlyUrl: site.friendlyUrlPath,
    };
  }

  const existingKey = String(existing?.templateKey ?? existing?.templateId ?? inventoryExisting?.id ?? '');

  if (!options.checkOnly) {
    if (existing) {
      const templateId = ensureString(existing.templateId, 'templateId');
      const classPk = String(existing.classPK ?? '0');
      await expectJsonSuccess(
        await authedPostForm(
          config,
          '/api/jsonws/ddm.ddmtemplate/update-template',
          {
            templateId,
            classPK: classPk,
            nameMap: localizedMap(options.key),
            descriptionMap: localizedMap(''),
            type: 'display',
            mode: '',
            language: 'ftl',
            script,
            cacheable: 'false',
          },
          dependencies,
        ),
        'template-update',
        'LIFERAY_RESOURCE_ERROR',
      );
    }
  }

  const runtime = await runLiferayResourceGetTemplate(
    config,
    {site: site.friendlyUrlPath, id: existingKey || options.key},
    dependencies,
  );
  const normalizedRuntimeScript = normalizeLiferayTemplateScript(runtime.templateScript);
  if (normalizedRuntimeScript !== '' && sha256(normalizedRuntimeScript) !== localSha) {
    throw new CliError(`Hash mismatch template '${options.key}'`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }

  return {
    status: normalizeSyncStatus(Boolean(options.checkOnly)),
    id: existingKey,
    name: options.key,
    extra: '',
    templateFile,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
  };
}

export function formatLiferayResourceSyncTemplate(result: LiferayResourceSyncTemplateResult): string {
  return [
    `${result.status}\t${result.name}\t${result.id}`,
    `site=${result.siteFriendlyUrl} (${result.siteId})`,
    `file=${result.templateFile}`,
  ].join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _matchesTemplate(item: Record<string, unknown>, identifier: string): boolean {
  return [
    String(item.templateId ?? ''),
    String(item.templateKey ?? ''),
    String(item.externalReferenceCode ?? ''),
    String(item.nameCurrentValue ?? ''),
    String(item.name ?? ''),
  ].includes(identifier);
}

async function tryGetDdmTemplateByKey(
  config: AppConfig,
  siteId: number,
  classNameId: number,
  templateKey: string,
  dependencies?: ResourceSyncDependencies,
): Promise<Record<string, unknown> | null> {
  try {
    return await authedGetJson<Record<string, unknown>>(
      config,
      `/api/jsonws/ddm.ddmtemplate/get-template?groupId=${siteId}&classNameId=${classNameId}&templateKey=${encodeURIComponent(templateKey)}`,
      'template-ddm-get',
      dependencies,
    );
  } catch (error) {
    if (error instanceof CliError && error.message.includes('status=404')) {
      return null;
    }
    throw error;
  }
}
