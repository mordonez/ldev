/**
 * Import strategy for Liferay picklists (list type definitions).
 *
 * The definition is written with its entries in one request; entries are then
 * reconciled by key against a fresh read so the result does not depend on
 * whether the portal's PUT manages nested entries.
 */

import fs from 'fs-extra';

import {LiferayErrors} from '../../errors/index.js';
import {createLiferayGateway} from '../../liferay-gateway.js';
import {sha256} from '../liferay-resource-artifact-shared.js';
import {asRecords, isRecord, matchesRemote, textOf} from '../liferay-resource-object-diff.js';
import {
  LIST_TYPE_ADMIN_BASE,
  diffPicklist,
  getPicklistByErc,
  normalizePicklist,
  resolvePicklistFile,
  type PicklistPayload,
} from '../liferay-resource-picklist-shared.js';
import type {ImportStrategy, RemoteArtifact} from '../import-engine.js';
import {rethrowGatewayAsResourceError} from './shared.js';

export type PicklistLocalData = {
  filePath: string;
  picklist: Record<string, unknown>;
};

export type PicklistRemoteData = {
  picklist: PicklistPayload;
};

export type PicklistImportOptions = {
  key?: string;
  file?: string;
  allowBreakingChange?: boolean;
};

export const picklistImportStrategy: ImportStrategy<PicklistLocalData, PicklistRemoteData> = {
  async resolveLocal(config, _site, options) {
    const opts = options as PicklistImportOptions;
    const filePath = await resolvePicklistFile(config, opts.key, opts.file);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      throw LiferayErrors.resourceError(`Invalid picklist JSON in ${filePath}: ${String(error)}`);
    }
    if (!isRecord(parsed)) {
      throw LiferayErrors.resourceError(`Picklist file must contain a JSON object: ${filePath}`);
    }

    const picklist = normalizePicklist(parsed);
    const externalReferenceCode = textOf(picklist.externalReferenceCode);
    if (externalReferenceCode === '') {
      throw LiferayErrors.resourceError(`Picklist file has no externalReferenceCode: ${filePath}`);
    }
    if (opts.key && opts.key !== externalReferenceCode) {
      throw LiferayErrors.resourceError(
        `--picklist '${opts.key}' does not match externalReferenceCode '${externalReferenceCode}' in ${filePath}`,
      );
    }
    const keys = asRecords(picklist.listTypeEntries).map((entry) => textOf(entry.key));
    if (keys.some((key) => key === '') || new Set(keys).size !== keys.length) {
      throw LiferayErrors.resourceError(`Picklist entries need a unique, non-empty key: ${filePath}`);
    }

    const normalizedContent = JSON.stringify(picklist);
    return {
      id: externalReferenceCode,
      normalizedContent,
      contentHash: sha256(normalizedContent),
      data: {filePath, picklist},
    };
  },

  async findRemote(config, _site, localArtifact, _options, dependencies) {
    const picklist = await getPicklistByErc(config, localArtifact.id, dependencies);
    return picklist ? toRemoteArtifact(picklist) : null;
  },

  preview(_config, _site, localArtifact, remoteArtifact, options) {
    guardRemovedEntries(localArtifact.id, localArtifact.data.picklist, remoteArtifact, options);
    return Promise.resolve(remoteArtifact);
  },

  async upsert(config, _site, localArtifact, remoteArtifact, options, dependencies) {
    guardRemovedEntries(localArtifact.id, localArtifact.data.picklist, remoteArtifact, options);
    const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
    const local = localArtifact.data.picklist;

    try {
      const saved = remoteArtifact
        ? await gateway.putJson<PicklistPayload>(
            `${LIST_TYPE_ADMIN_BASE}/list-type-definitions/${Number(remoteArtifact.id)}`,
            local,
            'picklist-update',
          )
        : await gateway.postJson<PicklistPayload>(
            `${LIST_TYPE_ADMIN_BASE}/list-type-definitions`,
            local,
            'picklist-create',
          );

      const current = await getPicklistByErc(config, localArtifact.id, dependencies);
      const picklistId = Number(saved.id ?? current?.id);
      const remoteEntries = new Map(asRecords(current?.listTypeEntries).map((entry) => [textOf(entry.key), entry]));
      const localKeys = new Set<string>();

      for (const entry of asRecords(local.listTypeEntries)) {
        const key = textOf(entry.key);
        localKeys.add(key);
        const existing = remoteEntries.get(key);
        if (!existing) {
          await gateway.postJson(
            `${LIST_TYPE_ADMIN_BASE}/list-type-definitions/${picklistId}/list-type-entries`,
            entry,
            'picklist-entry-create',
          );
        } else if (!matchesRemote(entry, existing)) {
          await gateway.putJson(
            `${LIST_TYPE_ADMIN_BASE}/list-type-entries/${Number(existing.id)}`,
            entry,
            'picklist-entry-update',
          );
        }
      }

      // Only reachable with --allow-breaking-change: the guard rejected removals otherwise.
      for (const [key, existing] of remoteEntries) {
        if (!localKeys.has(key)) {
          await gateway.deleteJson(
            `${LIST_TYPE_ADMIN_BASE}/list-type-entries/${Number(existing.id)}`,
            'picklist-entry-delete',
          );
        }
      }

      return toRemoteArtifact({...saved, id: picklistId});
    } catch (error) {
      rethrowGatewayAsResourceError(error);
    }
  },

  verify(_config, _site, localArtifact, remoteArtifact) {
    const pending = diffPicklist(localArtifact.data.picklist, remoteArtifact.data.picklist);
    if (pending.length > 0) {
      throw LiferayErrors.resourceError(
        `Read-back mismatch for picklist '${localArtifact.id}': ${pending.map((change) => `${change.kind} ${change.path}`).join(', ')}`,
        {details: {externalReferenceCode: localArtifact.id, pending}},
      );
    }
    return Promise.resolve();
  },
};

/** Removing an entry orphans the key stored in existing object entries. */
function guardRemovedEntries(
  externalReferenceCode: string,
  local: Record<string, unknown>,
  remoteArtifact: RemoteArtifact<PicklistRemoteData> | null,
  options: Record<string, unknown>,
): void {
  if (!remoteArtifact || (options as PicklistImportOptions).allowBreakingChange) {
    return;
  }
  const removed = diffPicklist(local, remoteArtifact.data.picklist)
    .filter((change) => change.kind === 'remove')
    .map((change) => change.path);
  if (removed.length > 0) {
    throw LiferayErrors.resourceBreakingChange(
      `Picklist '${externalReferenceCode}' would delete entries whose keys may be stored in object entries: ${removed.join(', ')}. ` +
        'Restore them in the file or pass --allow-breaking-change.',
      {details: {externalReferenceCode, removed}},
    );
  }
}

function toRemoteArtifact(picklist: PicklistPayload): RemoteArtifact<PicklistRemoteData> {
  return {
    id: String(picklist.id ?? ''),
    name: textOf(picklist.externalReferenceCode),
    data: {picklist},
  };
}
