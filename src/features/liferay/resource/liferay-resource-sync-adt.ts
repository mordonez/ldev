import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import {
  ADT_CLASS_BY_WIDGET_TYPE,
  normalizeAdtWidgetType,
  runLiferayResourceListAdts,
} from './liferay-resource-list-adts.js';
import {resolveAdtFile, ADT_WIDGET_DIR_BY_TYPE} from './liferay-resource-paths.js';
import {fetchAdtResourceClassNameId, fetchClassNameIdForValue, resolveResourceSite} from './liferay-resource-shared.js';
import {
  authedGetJson,
  authedPostForm,
  localizedMap,
  normalizeSyncStatus,
  sha256,
  type ResourceSyncDependencies,
  type ResourceSyncResult,
} from './liferay-resource-sync-shared.js';

export type LiferayResourceSyncAdtResult = ResourceSyncResult & {
  adtFile: string;
  widgetType: string;
  siteId: number;
  siteFriendlyUrl: string;
};

export async function runLiferayResourceSyncAdt(
  config: AppConfig,
  options: {
    site?: string;
    key?: string;
    widgetType?: string;
    className?: string;
    file?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncAdtResult> {
  const resolvedWidget = normalizeAdtWidgetType(options.widgetType ?? inferAdtWidgetType(options.file ?? ''));
  const resolvedClassName = options.className?.trim() || ADT_CLASS_BY_WIDGET_TYPE[resolvedWidget];
  if (!resolvedWidget || !resolvedClassName) {
    throw new CliError(`widget-type ADT no soportado: ${resolvedWidget || options.widgetType || ''}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  const name = options.key?.trim() || inferAdtName(options.file ?? '');
  const adtFile = await resolveAdtFile(config, name, resolvedWidget, options.file);
  const script = await fs.readFile(adtFile, 'utf8');
  const localSha = sha256(script);
  const site = await resolveResourceSite(config, options.site ?? '/global', dependencies);
  const existing = (
    await runLiferayResourceListAdts(
      config,
      {site: site.friendlyUrlPath, widgetType: resolvedWidget, className: resolvedClassName, includeScript: true},
      dependencies,
    )
  ).find((item) => [item.templateKey, item.adtName, item.displayName].includes(name));

  const classNameId = await fetchClassNameIdForValue(config, resolvedClassName, dependencies);
  const resourceClassNameId = await fetchAdtResourceClassNameId(config, dependencies);

  if (!existing) {
    if (!options.createMissing) {
      throw new CliError(`ADT '${name}' does not exist and create-missing is not enabled.`, {
        code: 'LIFERAY_RESOURCE_ERROR',
      });
    }
    if (options.checkOnly) {
      return {
        status: 'checked_missing',
        id: '',
        name,
        extra: resolvedWidget,
        adtFile,
        widgetType: resolvedWidget,
        siteId: site.id,
        siteFriendlyUrl: site.friendlyUrlPath,
      };
    }

    const created = await expectJsonSuccess(
      await authedPostForm<Record<string, unknown>>(
        config,
        '/api/jsonws/ddm.ddmtemplate/add-template',
        {
          externalReferenceCode: name,
          groupId: String(site.id),
          classNameId: String(classNameId),
          classPK: '0',
          resourceClassNameId: String(resourceClassNameId),
          nameMap: localizedMap(name),
          descriptionMap: localizedMap(''),
          type: 'display',
          mode: '',
          language: 'ftl',
          script,
        },
        dependencies,
      ),
      'adt-create',
    );

    return {
      status: 'created',
      id: String(created.data?.templateKey ?? created.data?.templateId ?? ''),
      name,
      extra: resolvedWidget,
      adtFile,
      widgetType: resolvedWidget,
      siteId: site.id,
      siteFriendlyUrl: site.friendlyUrlPath,
    };
  }

  if (!options.checkOnly) {
    const ddmTemplate = await authedGetJson<Record<string, unknown>>(
      config,
      `/api/jsonws/ddm.ddmtemplate/get-template?templateId=${existing.templateId}`,
      'adt-ddm-get',
      dependencies,
    );
    await expectJsonSuccess(
      await authedPostForm(
        config,
        '/api/jsonws/ddm.ddmtemplate/update-template',
        {
          templateId: String(existing.templateId),
          classPK: String(ddmTemplate.classPK ?? '0'),
          nameMap: localizedMap(name),
          descriptionMap: localizedMap(''),
          type: 'display',
          mode: '',
          language: 'ftl',
          script,
          cacheable: 'false',
        },
        dependencies,
      ),
      'adt-update',
    );
  }

  const runtime = (
    await runLiferayResourceListAdts(
      config,
      {site: site.friendlyUrlPath, widgetType: resolvedWidget, className: resolvedClassName, includeScript: true},
      dependencies,
    )
  ).find((item) => String(item.templateId) === String(existing.templateId));
  if (runtime?.script && sha256(runtime.script) !== localSha) {
    throw new CliError(`Hash mismatch ADT '${name}'`, {code: 'LIFERAY_RESOURCE_ERROR'});
  }

  return {
    status: normalizeSyncStatus(Boolean(options.checkOnly)),
    id: String(existing.templateKey || existing.templateId),
    name,
    extra: resolvedWidget,
    adtFile,
    widgetType: resolvedWidget,
    siteId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
  };
}

export function formatLiferayResourceSyncAdt(result: LiferayResourceSyncAdtResult): string {
  return [
    `${result.status}\t${result.widgetType}\t${result.name}\t${result.id}`,
    `site=${result.siteFriendlyUrl} (${result.siteId})`,
    `file=${result.adtFile}`,
  ].join('\n');
}

function inferAdtWidgetType(file: string): string {
  if (!file) {
    return '';
  }
  const dir = path.basename(path.dirname(file));
  const match = Object.entries(ADT_WIDGET_DIR_BY_TYPE).find(([, value]) => value === dir);
  return match?.[0] ?? '';
}

function inferAdtName(file: string): string {
  if (!file) {
    throw new CliError(
      "ADT requires --file or (--key and --widget-type). Use 'resource resolve-adt --display-style ddmTemplate_<ID>' if you need to resolve it first.",
      {code: 'LIFERAY_RESOURCE_ERROR'},
    );
  }
  return path.basename(file, path.extname(file));
}

async function expectJsonSuccess<T>(
  response: {ok: boolean; status: number; data: T | null},
  label: string,
): Promise<{ok: boolean; status: number; data: T | null}> {
  if (response.ok) {
    return response;
  }
  throw new CliError(`${label} failed with status=${response.status}.`, {code: 'LIFERAY_RESOURCE_ERROR'});
}
