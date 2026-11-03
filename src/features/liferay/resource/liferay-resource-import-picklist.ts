/**
 * Liferay picklist import through the shared ImportEngine. Picklists are
 * company-scoped, so the engine runs against a fixed company scope.
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import type {ResolvedSite} from '../portal/site-resolution.js';
import type {ImportArtifactResult, ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {runImportArtifactDetailed} from './import-engine.js';
import {picklistImportStrategy} from './import-strategies/picklist-import-strategy.js';
import {diffPicklist, type PicklistChange} from './liferay-resource-picklist-shared.js';

export type LiferayResourceImportPicklistResult = ImportArtifactResult & {
  externalReferenceCode: string;
  picklistFile: string;
  /** Pending changes in check-only mode; applied changes otherwise. */
  changes: PicklistChange[];
};

const COMPANY_SCOPE: ResolvedSite = {id: 0, friendlyUrlPath: '/global', name: 'Company'};

export async function runLiferayResourceImportPicklist(
  config: AppConfig,
  options: {
    key?: string;
    file?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
    allowBreakingChange?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportPicklistResult> {
  const outcome = await runImportArtifactDetailed(
    config,
    COMPANY_SCOPE,
    picklistImportStrategy,
    {
      checkOnly: options.checkOnly,
      createMissing: options.createMissing,
      strategyOptions: {
        key: options.key,
        file: options.file,
        allowBreakingChange: options.allowBreakingChange,
      },
    },
    dependencies,
  );

  return {
    ...outcome.result,
    externalReferenceCode: outcome.localArtifact.id,
    picklistFile: outcome.localArtifact.data.filePath,
    changes: outcome.initialRemoteArtifact
      ? diffPicklist(outcome.localArtifact.data.picklist, outcome.initialRemoteArtifact.data.picklist)
      : [{kind: 'add', path: outcome.localArtifact.id}],
  };
}

export function formatLiferayResourceImportPicklist(result: LiferayResourceImportPicklistResult): string {
  return [
    `${result.status}\t${result.externalReferenceCode}\t${result.id}`,
    `file=${result.picklistFile}`,
    ...(result.changes.length === 0 ? ['changes=none'] : result.changes.map((c) => `${c.kind}\t${c.path}`)),
  ].join('\n');
}
