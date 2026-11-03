/**
 * Request bodies for the object definition PUT, which matches fields and
 * relationships by externalReferenceCode and deletes forward relationships
 * missing from the body.
 */

import {asRecords, textOf} from '../liferay-resource-object-diff.js';
import type {ObjectDefinitionPayload} from '../liferay-resource-object-shared.js';

/**
 * The definition PUT matches fields by externalReferenceCode, not by name: a
 * field without ERC is treated as new ("Duplicate name"). Reuse the remote ERC
 * of the field with the same name when the file does not declare one.
 */
export function withRemoteFieldErcs(
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
export function completeRelationships(
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
