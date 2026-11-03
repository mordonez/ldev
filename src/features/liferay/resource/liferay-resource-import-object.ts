/**
 * Liferay Object Definition import.
 *
 * Imports a local object definition JSON (as written by export-object) into the
 * portal through the shared ImportEngine. Object definitions are company-scoped,
 * so the engine runs against a fixed company scope instead of a resolved site.
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import type {ResolvedSite} from '../portal/site-resolution.js';
import type {ImportArtifactResult, ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {runImportArtifactDetailed} from './import-engine.js';
import {objectDefinitionImportStrategy} from './import-strategies/object-definition-import-strategy.js';
import {diffObjectDefinition, type ObjectDefinitionChange} from './liferay-resource-object-shared.js';

export type LiferayResourceImportObjectResult = ImportArtifactResult & {
  externalReferenceCode: string;
  objectFile: string;
  /** Pending changes in check-only mode; applied changes otherwise. */
  changes: ObjectDefinitionChange[];
  published: boolean;
  relationshipsCreated: string[];
  relationshipsUpdated: string[];
};

const COMPANY_SCOPE: ResolvedSite = {id: 0, friendlyUrlPath: '/global', name: 'Company'};

export async function runLiferayResourceImportObject(
  config: AppConfig,
  options: {
    key?: string;
    file?: string;
    checkOnly?: boolean;
    createMissing?: boolean;
    allowBreakingChange?: boolean;
  },
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportObjectResult> {
  const outcome = await runImportArtifactDetailed(
    config,
    COMPANY_SCOPE,
    objectDefinitionImportStrategy,
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

  const local = outcome.localArtifact.data.definition;
  const changes = outcome.initialRemoteArtifact
    ? diffObjectDefinition(local, outcome.initialRemoteArtifact.data.definition)
    : [{kind: 'add' as const, path: outcome.localArtifact.id}];
  const applied = outcome.changedRemoteArtifact?.data;

  return {
    ...outcome.result,
    externalReferenceCode: outcome.localArtifact.id,
    objectFile: outcome.localArtifact.data.filePath,
    changes,
    published: applied?.published ?? false,
    relationshipsCreated: applied?.relationshipsCreated ?? [],
    relationshipsUpdated: applied?.relationshipsUpdated ?? [],
  };
}

export function formatLiferayResourceImportObject(result: LiferayResourceImportObjectResult): string {
  const lines = [`${result.status}\t${result.externalReferenceCode}\t${result.id}`, `file=${result.objectFile}`];
  if (result.changes.length === 0) {
    lines.push('changes=none');
  }
  for (const change of result.changes) {
    lines.push(`${change.kind}\t${change.path}`);
  }
  if (result.published) {
    lines.push('published=true');
  }
  if (result.relationshipsCreated.length > 0) {
    lines.push(`relationshipsCreated=${result.relationshipsCreated.join(',')}`);
  }
  if (result.relationshipsUpdated.length > 0) {
    lines.push(`relationshipsUpdated=${result.relationshipsUpdated.join(',')}`);
  }
  return lines.join('\n');
}
