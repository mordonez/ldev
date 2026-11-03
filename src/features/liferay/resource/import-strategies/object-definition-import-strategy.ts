/**
 * Import strategy for Liferay Object Definitions.
 *
 * The definition (properties + custom fields) is written with a single PUT by
 * ERC; forward relationships are reconciled one by one because the definition
 * PUT does not manage them. Remote-only relationships are never deleted.
 */

import fs from 'fs-extra';

import type {AppConfig} from '../../../../core/config/load-config.js';
import {LiferayErrors} from '../../errors/index.js';
import {createLiferayGateway} from '../../liferay-gateway.js';
import type {ResolvedSite} from '../../portal/site-resolution.js';
import {sha256, type ResourceDependencies} from '../liferay-resource-artifact-shared.js';
import {
  OBJECT_ADMIN_BASE,
  asRecords,
  diffObjectDefinition,
  getObjectDefinitionByErc,
  isRecord,
  listObjectRelationships,
  matchesRemote,
  normalizeObjectDefinition,
  resolveObjectDefinitionFile,
  textOf,
  type ObjectDefinitionPayload,
} from '../liferay-resource-object-shared.js';
import {getPicklistByErc} from '../liferay-resource-picklist-shared.js';
import type {ImportStrategy, LocalArtifact, RemoteArtifact} from '../import-engine.js';
import {rethrowGatewayAsResourceError} from './shared.js';

export type ObjectDefinitionLocalData = {
  filePath: string;
  definition: Record<string, unknown>;
};

export type ObjectDefinitionRemoteData = {
  definition: ObjectDefinitionPayload;
  relationshipsCreated: string[];
  relationshipsUpdated: string[];
  published: boolean;
};

export type ObjectDefinitionImportOptions = {
  key?: string;
  file?: string;
  allowBreakingChange?: boolean;
};

const APPROVED_STATUS_CODE = 0;

export const objectDefinitionImportStrategy: ImportStrategy<ObjectDefinitionLocalData, ObjectDefinitionRemoteData> = {
  async resolveLocal(config, _site, options) {
    const opts = options as ObjectDefinitionImportOptions;
    const filePath = await resolveObjectDefinitionFile(config, opts.key, opts.file);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      throw LiferayErrors.resourceError(`Invalid object definition JSON in ${filePath}: ${String(error)}`);
    }
    if (!isRecord(parsed)) {
      throw LiferayErrors.resourceError(`Object definition file must contain a JSON object: ${filePath}`);
    }

    const definition = normalizeObjectDefinition(parsed);
    const externalReferenceCode = textOf(definition.externalReferenceCode);
    if (externalReferenceCode === '') {
      throw LiferayErrors.resourceError(`Object definition file has no externalReferenceCode: ${filePath}`);
    }
    if (opts.key && opts.key !== externalReferenceCode) {
      throw LiferayErrors.resourceError(
        `--object '${opts.key}' does not match externalReferenceCode '${externalReferenceCode}' in ${filePath}`,
      );
    }

    const normalizedContent = JSON.stringify(definition);
    return {
      id: externalReferenceCode,
      normalizedContent,
      contentHash: sha256(normalizedContent),
      data: {filePath, definition},
    };
  },

  async findRemote(config, _site, localArtifact, _options, dependencies) {
    const definition = await findObjectDefinitionByErc(config, localArtifact.id, dependencies);
    return definition ? toRemoteArtifact(definition) : null;
  },

  async preview(config, site, localArtifact, remoteArtifact, options, dependencies) {
    await validateObjectDefinition(config, site, localArtifact, remoteArtifact, options, dependencies);
    return remoteArtifact;
  },

  async upsert(config, site, localArtifact, remoteArtifact, options, dependencies) {
    const relationshipTargets = await validateObjectDefinition(
      config,
      site,
      localArtifact,
      remoteArtifact,
      options,
      dependencies,
    );
    const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
    const payload = withRemoteFieldErcs(localArtifact.data.definition, remoteArtifact?.data.definition);
    if (remoteArtifact) {
      // The PUT deletes forward relationships missing from the body (and the links
      // stored in them), so it always carries the complete set.
      payload.objectRelationships = completeRelationships(
        asRecords(localArtifact.data.definition.objectRelationships),
        asRecords(remoteArtifact.data.definition.objectRelationships),
      );
    } else {
      // Targets are resolved to ids below, once this definition exists.
      delete payload.objectRelationships;
    }

    let saved: ObjectDefinitionPayload;
    try {
      saved = remoteArtifact
        ? await gateway.putJson<ObjectDefinitionPayload>(
            `${OBJECT_ADMIN_BASE}/object-definitions/by-external-reference-code/${encodeURIComponent(localArtifact.id)}`,
            payload,
            'object-update',
          )
        : await gateway.postJson<ObjectDefinitionPayload>(
            `${OBJECT_ADMIN_BASE}/object-definitions`,
            payload,
            'object-create',
          );
    } catch (error) {
      rethrowGatewayAsResourceError(error);
    }

    const objectDefinitionId = Number(saved.id);
    let published = false;
    if (saved.status?.code !== APPROVED_STATUS_CODE) {
      try {
        await gateway.postJson(
          `${OBJECT_ADMIN_BASE}/object-definitions/${objectDefinitionId}/publish`,
          {},
          'object-publish',
        );
      } catch (error) {
        rethrowGatewayAsResourceError(error);
      }
      published = true;
    }

    // The update PUT may already have applied the relationships; reconcile
    // against a fresh read so nothing is created twice.
    const initialRelationships = new Map(
      asRecords(remoteArtifact?.data.definition.objectRelationships).map((rel) => [textOf(rel.name), rel]),
    );
    const currentRelationships = new Map(
      (await listObjectRelationships(config, objectDefinitionId, dependencies)).map((rel) => [textOf(rel.name), rel]),
    );
    const relationshipsCreated: string[] = [];
    const relationshipsUpdated: string[] = [];

    for (const relationship of asRecords(localArtifact.data.definition.objectRelationships)) {
      const name = textOf(relationship.name);
      const initial = initialRelationships.get(name);
      if (!initial) {
        relationshipsCreated.push(name);
      } else if (!matchesRemote(relationship, initial)) {
        relationshipsUpdated.push(name);
      }

      const current = currentRelationships.get(name);
      if (current && matchesRemote(relationship, current)) {
        continue;
      }
      const body = {
        ...relationship,
        objectDefinitionId1: objectDefinitionId,
        objectDefinitionId2:
          relationshipTargets.get(textOf(relationship.objectDefinitionExternalReferenceCode2)) ?? objectDefinitionId,
      };
      try {
        await (current
          ? gateway.putJson(
              `${OBJECT_ADMIN_BASE}/object-relationships/${Number(current.id)}`,
              body,
              'object-relationship-update',
            )
          : gateway.postJson(
              `${OBJECT_ADMIN_BASE}/object-definitions/${objectDefinitionId}/object-relationships`,
              body,
              'object-relationship-create',
            ));
      } catch (error) {
        rethrowGatewayAsResourceError(error);
      }
    }

    return {
      ...toRemoteArtifact(saved),
      data: {definition: saved, relationshipsCreated, relationshipsUpdated, published},
    };
  },

  verify(_config, _site, localArtifact, remoteArtifact) {
    const pending = diffObjectDefinition(localArtifact.data.definition, remoteArtifact.data.definition);
    if (pending.length > 0) {
      throw LiferayErrors.resourceError(
        `Read-back mismatch for object '${localArtifact.id}': ${pending.map((change) => `${change.kind} ${change.path}`).join(', ')}`,
        {details: {externalReferenceCode: localArtifact.id, pending}},
      );
    }
    return Promise.resolve();
  },
};

/**
 * Validate everything the import needs before mutating anything:
 * - custom fields removed locally require --allow-breaking-change (the PUT deletes them, with their data);
 * - referenced picklists must exist;
 * - relationship target definitions must exist (returns ERC -> id for the relationship payloads).
 */
export async function validateObjectDefinition(
  config: AppConfig,
  _site: ResolvedSite,
  localArtifact: LocalArtifact<ObjectDefinitionLocalData>,
  remoteArtifact: RemoteArtifact<ObjectDefinitionRemoteData> | null,
  options: Record<string, unknown>,
  dependencies?: ResourceDependencies,
): Promise<Map<string, number>> {
  const opts = options as ObjectDefinitionImportOptions;
  const local = localArtifact.data.definition;

  if (remoteArtifact && !opts.allowBreakingChange) {
    const removed = diffObjectDefinition(local, remoteArtifact.data.definition)
      .filter((change) => change.kind === 'remove')
      .map((change) => change.path);
    if (removed.length > 0) {
      throw LiferayErrors.resourceBreakingChange(
        `Object '${localArtifact.id}' would delete remote fields and their data: ${removed.join(', ')}. ` +
          'Restore them in the file or pass --allow-breaking-change.',
        {details: {externalReferenceCode: localArtifact.id, removed}},
      );
    }
  }

  const picklists = new Set(
    asRecords(local.objectFields)
      .map((field) => textOf(field.listTypeDefinitionExternalReferenceCode))
      .filter((erc) => erc !== ''),
  );
  const missingPicklists: string[] = [];
  for (const erc of picklists) {
    if (!(await getPicklistByErc(config, erc, dependencies))) {
      missingPicklists.push(erc);
    }
  }
  if (missingPicklists.length > 0) {
    throw LiferayErrors.resourceError(
      `Object '${localArtifact.id}' references missing picklists: ${missingPicklists.join(', ')}. ` +
        'Import them first with `ldev resource import-picklist --create-missing`.',
      {details: {externalReferenceCode: localArtifact.id, missingPicklists}},
    );
  }

  const targets = new Map<string, number>();
  const missingTargets: string[] = [];
  for (const relationship of asRecords(local.objectRelationships)) {
    const erc = textOf(relationship.objectDefinitionExternalReferenceCode2);
    if (erc === '' || targets.has(erc)) {
      continue;
    }
    // A self-relationship targets this definition, which may not exist yet on create.
    if (erc === localArtifact.id && !remoteArtifact) {
      continue;
    }
    const target = await findObjectDefinitionByErc(config, erc, dependencies);
    if (target) {
      targets.set(erc, Number(target.id));
    } else {
      missingTargets.push(`${String(relationship.name)} -> ${erc}`);
    }
  }
  if (missingTargets.length > 0) {
    throw LiferayErrors.resourceError(
      `Object '${localArtifact.id}' has relationships to missing object definitions: ${missingTargets.join(', ')}`,
      {details: {externalReferenceCode: localArtifact.id, missingTargets}},
    );
  }

  return targets;
}

async function findObjectDefinitionByErc(
  config: AppConfig,
  externalReferenceCode: string,
  dependencies?: ResourceDependencies,
): Promise<ObjectDefinitionPayload | null> {
  const definition = await getObjectDefinitionByErc(config, externalReferenceCode, dependencies);
  if (!definition) {
    return null;
  }
  return {
    ...definition,
    objectRelationships: await listObjectRelationships(config, Number(definition.id), dependencies),
  };
}

/**
 * The definition PUT matches fields by externalReferenceCode, not by name: a
 * field without ERC is treated as new ("Duplicate name"). Reuse the remote ERC
 * of the field with the same name when the file does not declare one.
 */
function withRemoteFieldErcs(
  local: Record<string, unknown>,
  remote: ObjectDefinitionPayload | undefined,
): Record<string, unknown> {
  const remoteErcByName = new Map(
    asRecords(remote?.objectFields).map((field) => [textOf(field.name), textOf(field.externalReferenceCode)]),
  );
  return {
    ...local,
    objectFields: asRecords(local.objectFields).map((field) => {
      const erc = textOf(field.externalReferenceCode) || remoteErcByName.get(textOf(field.name)) || '';
      return erc === '' ? field : {...field, externalReferenceCode: erc};
    }),
  };
}

/**
 * Local relationships (with the remote ERC of the same name, since the PUT
 * matches by ERC) followed by every forward relationship that only exists
 * remotely, sent back as it is so the PUT keeps it.
 */
function completeRelationships(
  local: Record<string, unknown>[],
  remote: Record<string, unknown>[],
): Record<string, unknown>[] {
  const forwardRemote = remote.filter((relationship) => relationship.reverse !== true);
  const remoteByName = new Map(forwardRemote.map((relationship) => [textOf(relationship.name), relationship]));
  const localNames = new Set(local.map((relationship) => textOf(relationship.name)));

  return [
    ...local.map((relationship) => {
      const erc =
        textOf(relationship.externalReferenceCode) ||
        textOf(remoteByName.get(textOf(relationship.name))?.externalReferenceCode);
      return erc === '' ? relationship : {...relationship, externalReferenceCode: erc};
    }),
    ...forwardRemote.filter((relationship) => !localNames.has(textOf(relationship.name))),
  ];
}

function toRemoteArtifact(definition: ObjectDefinitionPayload): RemoteArtifact<ObjectDefinitionRemoteData> {
  return {
    id: String(definition.id ?? ''),
    name: String(definition.externalReferenceCode ?? definition.name ?? ''),
    data: {definition, relationshipsCreated: [], relationshipsUpdated: [], published: false},
  };
}
