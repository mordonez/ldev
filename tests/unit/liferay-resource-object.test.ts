import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {runLiferayResourceExportObject} from '../../src/features/liferay/resource/liferay-resource-export-object.js';
import {runLiferayResourceGetObject} from '../../src/features/liferay/resource/liferay-resource-get-object.js';
import {runLiferayResourceImportObject} from '../../src/features/liferay/resource/liferay-resource-import-object.js';
import {
  diffObjectDefinition,
  normalizeObjectDefinition,
} from '../../src/features/liferay/resource/liferay-resource-object-shared.js';
import {createStaticTokenClient, createTestFetchImpl, toTestRequestBody} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const TOKEN_CLIENT = createStaticTokenClient();
const ADMIN = '/o/object-admin/v1.0';

type Definition = Record<string, unknown> & {id: number; externalReferenceCode: string; name: string};

function courseDefinition(): Definition {
  return {
    id: 501,
    externalReferenceCode: 'UB_COURSE',
    name: 'Course',
    className: 'com.liferay.object.model.ObjectDefinition#501',
    scope: 'company',
    status: {code: 0, label: 'approved'},
    dateCreated: '2026-01-01T00:00:00Z',
    actions: {get: {href: 'x'}},
    label: {en_US: 'Course'},
    pluralLabel: {en_US: 'Courses'},
    objectActions: [{name: 'notify'}],
    objectFields: [
      {id: 9, name: 'title', businessType: 'Text', DBType: 'String', required: true, system: false},
      {
        id: 10,
        name: 'level',
        businessType: 'Picklist',
        DBType: 'String',
        listTypeDefinitionExternalReferenceCode: 'UB_LEVELS',
        listTypeDefinitionId: 77,
        system: false,
      },
      {id: 1, name: 'createDate', businessType: 'Date', system: true},
    ],
  };
}

function createFixture() {
  const repoRoot = createTempDir('dev-cli-resource-object-');
  return {
    repoRoot,
    objectsDir: path.join(repoRoot, 'liferay', 'resources', 'objects'),
    config: {
      cwd: repoRoot,
      repoRoot,
      dockerDir: path.join(repoRoot, 'docker'),
      liferayDir: path.join(repoRoot, 'liferay'),
      files: {dockerEnv: path.join(repoRoot, 'docker', '.env'), liferayProfile: null},
      liferay: {
        url: 'http://localhost:8080',
        oauth2ClientId: 'client-id',
        oauth2ClientSecret: 'client-secret',
        scopeAliases: 'scope-a',
        timeoutSeconds: 30,
      },
      paths: {
        structures: 'liferay/resources/journal/structures',
        templates: 'liferay/resources/journal/templates',
        adts: 'liferay/resources/templates/application_display',
        fragments: 'liferay/fragments',
        objects: 'liferay/resources/objects',
      },
    },
  };
}

/** Minimal in-memory object-admin API: definitions keyed by ERC, relationships by definition id. */
function createObjectAdminServer(options: {definitions: Definition[]; picklists?: string[]}) {
  const definitions = new Map(options.definitions.map((definition) => [definition.externalReferenceCode, definition]));
  const relationships = new Map<number, Record<string, unknown>[]>();
  const picklists = new Set(options.picklists ?? []);
  const calls: string[] = [];
  let nextId = 900;

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

  const fetchImpl = createTestFetchImpl((url, init) => {
    const method = init?.method ?? 'GET';
    const {pathname} = new URL(url);
    calls.push(`${method} ${pathname}`);
    const body = (init?.body ? JSON.parse(toTestRequestBody(init.body)) : {}) as Definition;

    const byErc = /^\/o\/object-admin\/v1\.0\/object-definitions\/by-external-reference-code\/([^/]+)$/.exec(pathname);
    if (byErc) {
      const erc = decodeURIComponent(byErc[1]);
      const existing = definitions.get(erc);
      if (method === 'GET') {
        return existing ? json(existing) : json({status: 'NOT_FOUND'}, 404);
      }
      const updated = {...body, id: existing?.id ?? nextId++, status: existing?.status};
      definitions.set(erc, updated);
      return json(updated);
    }

    if (pathname === `${ADMIN}/object-definitions` && method === 'GET') {
      return json({items: [...definitions.values()], lastPage: 1});
    }
    if (pathname === `${ADMIN}/object-definitions` && method === 'POST') {
      const created = {...body, id: nextId++, status: {code: 2, label: 'draft'}};
      definitions.set(created.externalReferenceCode, created);
      return json(created);
    }

    const publish = /^\/o\/object-admin\/v1\.0\/object-definitions\/(\d+)\/publish$/.exec(pathname);
    if (publish) {
      const definition = [...definitions.values()].find((item) => item.id === Number(publish[1]));
      if (definition) {
        definition.status = {code: 0, label: 'approved'};
      }
      return json(definition ?? {});
    }

    const rels = /^\/o\/object-admin\/v1\.0\/object-definitions\/(\d+)\/object-relationships$/.exec(pathname);
    if (rels) {
      const id = Number(rels[1]);
      const list = relationships.get(id) ?? [];
      if (method === 'POST') {
        list.push({...body, id: nextId++});
        relationships.set(id, list);
        return json(list.at(-1));
      }
      return json({items: list, lastPage: 1});
    }

    const picklist =
      /^\/o\/headless-admin-list-type\/v1\.0\/list-type-definitions\/by-external-reference-code\/(.+)$/.exec(pathname);
    if (picklist) {
      return picklists.has(decodeURIComponent(picklist[1])) ? json({id: 1}) : json({}, 404);
    }

    throw new Error(`Unexpected ${method} ${url}`);
  });

  return {
    calls,
    definitions,
    relationships,
    dependencies: {apiClient: createLiferayApiClient({fetchImpl}), tokenClient: TOKEN_CLIENT},
  };
}

async function writeLocalDefinition(objectsDir: string, definition: Record<string, unknown>): Promise<string> {
  const file = path.join(objectsDir, `${String(definition.externalReferenceCode)}.json`);
  await fs.ensureDir(objectsDir);
  await fs.writeJson(file, definition, {spaces: 2});
  return file;
}

describe('object definition normalization', () => {
  test('drops ids, read-only data, system fields, reverse relationships and unmanaged sub-resources', () => {
    const normalized = normalizeObjectDefinition({
      ...courseDefinition(),
      objectRelationships: [
        {id: 3, name: 'courseToTeacher', objectDefinitionId1: 501, objectDefinitionExternalReferenceCode2: 'UB_T'},
        {id: 4, name: 'enrollmentToCourse', reverse: true},
      ],
    });

    expect(normalized).not.toHaveProperty('id');
    expect(normalized).not.toHaveProperty('status');
    expect(normalized).not.toHaveProperty('actions');
    expect(normalized).not.toHaveProperty('objectActions');
    expect((normalized.objectFields as {name: string}[]).map((field) => field.name)).toEqual(['level', 'title']);
    expect(normalized.objectFields).toEqual(
      expect.arrayContaining([expect.not.objectContaining({listTypeDefinitionId: 77})]),
    );
    expect(normalized.objectRelationships).toEqual([
      {name: 'courseToTeacher', objectDefinitionExternalReferenceCode2: 'UB_T'},
    ]);
  });

  test('diff ignores remote defaults the file omits and reports removed custom fields', () => {
    const remote = courseDefinition();
    const local = {
      externalReferenceCode: 'UB_COURSE',
      name: 'Course',
      label: {en_US: 'Course offering'},
      objectFields: [
        {name: 'title', businessType: 'Text'},
        {name: 'credits', businessType: 'Integer'},
      ],
    };

    expect(diffObjectDefinition(local, remote)).toEqual([
      {kind: 'change', path: 'label'},
      {kind: 'add', path: 'objectFields[credits]'},
      {kind: 'remove', path: 'objectFields[level]'},
    ]);
  });
});

describe('liferay resource object', () => {
  test('reads a definition by name and exports it to paths.objects/<erc>.json', async () => {
    const {config, objectsDir} = createFixture();
    const server = createObjectAdminServer({definitions: [courseDefinition()]});

    const result = await runLiferayResourceGetObject(config, {id: 'C_Course'}, server.dependencies);
    expect(result).toMatchObject({
      id: 501,
      externalReferenceCode: 'UB_COURSE',
      fieldNames: ['level', 'title'],
      picklists: ['UB_LEVELS'],
    });

    const exported = await runLiferayResourceExportObject(config, {id: 'UB_COURSE'}, server.dependencies);
    expect(exported.outputPath).toBe(path.join(objectsDir, 'UB_COURSE.json'));
    expect(await fs.readJson(exported.outputPath)).toEqual(result.definition);
  });

  test('check-only reports pending changes without writing', async () => {
    const {config, objectsDir} = createFixture();
    const server = createObjectAdminServer({definitions: [courseDefinition()], picklists: ['UB_LEVELS']});
    const local = normalizeObjectDefinition(courseDefinition());
    (local.objectFields as Record<string, unknown>[]).push({name: 'credits', businessType: 'Integer'});
    await writeLocalDefinition(objectsDir, local);

    const result = await runLiferayResourceImportObject(
      config,
      {key: 'UB_COURSE', checkOnly: true},
      server.dependencies,
    );

    expect(result.status).toBe('checked');
    expect(result.changes).toEqual([{kind: 'add', path: 'objectFields[credits]'}]);
    expect(server.calls.filter((call) => !call.startsWith('GET'))).toEqual([]);
  });

  test('refuses to delete remote custom fields without --allow-breaking-change', async () => {
    const {config, objectsDir} = createFixture();
    const server = createObjectAdminServer({definitions: [courseDefinition()], picklists: ['UB_LEVELS']});
    const local = normalizeObjectDefinition(courseDefinition());
    local.objectFields = (local.objectFields as {name: string}[]).filter((field) => field.name !== 'level');
    await writeLocalDefinition(objectsDir, local);

    await expect(
      runLiferayResourceImportObject(config, {key: 'UB_COURSE', checkOnly: true}, server.dependencies),
    ).rejects.toMatchObject({code: 'LIFERAY_RESOURCE_BREAKING_CHANGE'});
  });

  test('fails before writing when a referenced picklist does not exist', async () => {
    const {config, objectsDir} = createFixture();
    const server = createObjectAdminServer({definitions: [courseDefinition()]});
    await writeLocalDefinition(objectsDir, normalizeObjectDefinition(courseDefinition()));

    await expect(runLiferayResourceImportObject(config, {key: 'UB_COURSE'}, server.dependencies)).rejects.toThrow(
      /missing picklists: UB_LEVELS/,
    );
    expect(server.calls.filter((call) => !call.startsWith('GET'))).toEqual([]);
  });

  test('updates the definition, creates relationships and verifies by read-back', async () => {
    const {config, objectsDir} = createFixture();
    const teacher: Definition = {id: 600, externalReferenceCode: 'UB_TEACHER', name: 'Teacher', objectFields: []};
    const server = createObjectAdminServer({definitions: [courseDefinition(), teacher], picklists: ['UB_LEVELS']});
    const local = normalizeObjectDefinition(courseDefinition());
    local.label = {en_US: 'Course offering'};
    local.objectRelationships = [
      {name: 'courseToTeacher', type: 'oneToMany', objectDefinitionExternalReferenceCode2: 'UB_TEACHER'},
    ];
    await writeLocalDefinition(objectsDir, local);

    const result = await runLiferayResourceImportObject(config, {key: 'UB_COURSE'}, server.dependencies);

    expect(result).toMatchObject({
      status: 'updated',
      id: '501',
      relationshipsCreated: ['courseToTeacher'],
      changes: [
        {kind: 'change', path: 'label'},
        {kind: 'add', path: 'objectRelationships[courseToTeacher]'},
      ],
    });
    expect(server.calls).toContain(`PUT ${ADMIN}/object-definitions/by-external-reference-code/UB_COURSE`);
    expect(server.relationships.get(501)).toEqual([
      expect.objectContaining({name: 'courseToTeacher', objectDefinitionId1: 501, objectDefinitionId2: 600}),
    ]);
    expect(server.definitions.get('UB_COURSE')).not.toHaveProperty('objectRelationships');
  });

  test('creates and publishes a missing definition with --create-missing', async () => {
    const {config, objectsDir} = createFixture();
    const server = createObjectAdminServer({definitions: [], picklists: ['UB_LEVELS']});
    const file = await writeLocalDefinition(objectsDir, normalizeObjectDefinition(courseDefinition()));

    await expect(runLiferayResourceImportObject(config, {file}, server.dependencies)).rejects.toThrow(
      /create-missing is not enabled/,
    );

    const result = await runLiferayResourceImportObject(config, {file, createMissing: true}, server.dependencies);

    expect(result).toMatchObject({status: 'created', externalReferenceCode: 'UB_COURSE', published: true});
    expect(server.definitions.get('UB_COURSE')?.status).toEqual({code: 0, label: 'approved'});
  });
});
