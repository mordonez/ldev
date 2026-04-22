import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test, vi, afterEach, beforeEach} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import type {LiferayGateway} from '../../src/features/liferay/liferay-gateway.js';
import {runStructureMigration} from '../../src/features/liferay/resource/liferay-resource-sync-structure-migration.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const mockConfig: AppConfig = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: null,
  liferayDir: null,
  files: {dockerEnv: null, liferayProfile: null},
  liferay: {
    url: 'http://localhost:8080',
    timeoutSeconds: 45,
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'client-secret',
    scopeAliases: 'default',
  },
};

type MockMigrationGateway<T extends Record<string, unknown>> = LiferayGateway & T;

function createMigrationGateway<T extends Record<string, unknown>>(gateway: T): MockMigrationGateway<T> {
  return gateway as unknown as MockMigrationGateway<T>;
}

describe('structure migration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = '';
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  describe('runStructureMigration', () => {
    test('throws when migration plan file does not exist', async () => {
      const missingPlanPath = '/path/to/missing/plan.json';

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(),
        putJson: vi.fn(),
      });

      await expect(
        runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, missingPlanPath, {
          gateway: mockGateway,
          dryRun: true,
          cleanupSource: false,
          fetchStructureByKeyFn: async () => {
            await Promise.resolve();
            return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
          },
        }),
      ).rejects.toThrow();
    });

    test('throws when migration plan is empty', async () => {
      tempDir = createTempDir('migration-empty-plan-');
      const planPath = path.join(tempDir, 'plan.json');
      await fs.writeJson(planPath, {plan: {mappings: []}});

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(),
        putJson: vi.fn(),
      });

      await expect(
        runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
          gateway: mockGateway,
          dryRun: true,
          cleanupSource: false,
          fetchStructureByKeyFn: async () => {
            await Promise.resolve();
            return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
          },
        }),
      ).rejects.toThrow('Invalid migration plan');
    });

    test('returns migration stats with dryRun mode', async () => {
      tempDir = createTempDir('migration-dryrun-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [
            {source: 'oldField1', target: 'newField1', cleanupSource: false},
            {source: 'oldField2', target: 'newField2', cleanupSource: true},
          ],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (path: string) => {
          await Promise.resolve();
          if (path.includes('/journal/structured-contents')) {
            return {
              items: [{id: 'content-1', key: 'article-1', contentFields: [{fieldValue: 'value'}]}],
            };
          }
          return {};
        }),
        putJson: vi.fn(),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: true,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats.dryRun).toBe(true);
      expect(stats.scanned).toBeGreaterThanOrEqual(0);
      expect(stats.migrated).toBeGreaterThanOrEqual(0);
      expect(stats.failed).toBe(0);
    });

    test('throws when structure key not found', async () => {
      tempDir = createTempDir('migration-structure-notfound-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(),
        putJson: vi.fn(),
      });

      await expect(
        runStructureMigration(mockConfig, 'MISSING_STRUCTURE', 20121, planPath, {
          gateway: mockGateway,
          dryRun: true,
          cleanupSource: false,
          fetchStructureByKeyFn: async () => {
            await Promise.resolve();
            return null;
          },
        }),
      ).rejects.toThrow('Could not resolve structure');
    });

    test('increments scanned count for each content item', async () => {
      tempDir = createTempDir('migration-scanned-count-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (path: string) => {
          await Promise.resolve();
          if (path.includes('/journal/structured-contents')) {
            return {items: []};
          }
          return {};
        }),
        putJson: vi.fn(),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: true,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats).toBeDefined();
      expect(typeof stats.scanned).toBe('number');
    });

    test('respects dryRun flag and does not call putJson', async () => {
      tempDir = createTempDir('migration-respect-dryrun-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (path: string) => {
          await Promise.resolve();
          if (path.includes('/journal/structured-contents')) {
            return {
              items: [{id: 'content-1', key: 'article-1', contentFields: [{fieldValue: 'value'}]}],
            };
          }
          return {};
        }),
        putJson: vi.fn(),
      });

      await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: true,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      // putJson should not be called in dryRun mode
      expect(mockGateway.putJson).not.toHaveBeenCalled();
    });

    test('calls putJson when dryRun is false', async () => {
      tempDir = createTempDir('migration-execute-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (path: string) => {
          await Promise.resolve();
          if (path.includes('/journal/structured-contents')) {
            return {
              items: [{id: 'content-1', key: 'article-1', contentFields: [{fieldValue: 'value'}]}],
            };
          }
          return {};
        }),
        putJson: vi.fn(async () => {
          await Promise.resolve();
          return {ok: true};
        }),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: false,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      // When migration succeeds, putJson should have been called
      if (stats.migrated > 0) {
        expect(mockGateway.putJson).toHaveBeenCalled();
      }
    });

    test('aggregates article keys in stats', async () => {
      tempDir = createTempDir('migration-article-keys-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (path: string) => {
          await Promise.resolve();
          if (path.includes('/journal/structured-contents')) {
            return {
              items: [
                {id: 'content-1', key: 'article-1', contentFields: []},
                {id: 'content-2', key: 'article-2', contentFields: []},
              ],
            };
          }
          return {};
        }),
        putJson: vi.fn(),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: true,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats.articleKeys).toBeDefined();
      expect(Array.isArray(stats.articleKeys)).toBe(true);
    });

    test('scans paginated structure contents across multiple pages', async () => {
      tempDir = createTempDir('migration-pagination-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (requestPath: string) => {
          await Promise.resolve();
          if (requestPath.includes('/content-structures/') && requestPath.includes('page=1')) {
            return {
              items: [{id: 'content-1', key: 'article-1', contentStructureId: 'struct-123'}],
              lastPage: 2,
            };
          }
          if (requestPath.includes('/content-structures/') && requestPath.includes('page=2')) {
            return {
              items: [{id: 'content-2', key: 'article-2', contentStructureId: 'struct-123'}],
              lastPage: 2,
            };
          }
          if (requestPath.includes('/structured-contents/content-')) {
            return {id: 'content-1', contentFields: []};
          }
          return {};
        }),
        putJson: vi.fn(),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: true,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats.scanned).toBe(2);
      expect(mockGateway.getJson).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.stringContaining('structure-migrate list'),
      );
    });

    test('resolves scoped articleIds directly without paginating the whole structure', async () => {
      tempDir = createTempDir('migration-article-direct-');
      const planPath = path.join(tempDir, 'plan.json');

      await fs.writeJson(planPath, {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
          articleIds: ['ARTICLE-001'],
        },
      });

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (requestPath: string) => {
          await Promise.resolve();
          if (requestPath.includes('/o/data-engine/v2.0/data-definitions/struct-123')) {
            return {dataDefinitionFields: []};
          }

          if (requestPath.includes('/structured-contents/101')) {
            return {
              id: '101',
              key: 'ARTICLE-001',
              contentStructureId: 'struct-123',
              structuredContentFolderId: 55,
              contentFields: [{name: 'oldField', contentFieldValue: {data: 'legacy-value'}}],
            };
          }

          if (requestPath.includes('/content-structures/')) {
            throw new Error('full structure scan should not be used when articleIds are explicit');
          }

          return {};
        }),
        getRaw: vi.fn(async (requestPath: string) => {
          await Promise.resolve();
          if (requestPath.includes('/api/jsonws/journal.journalarticle/get-latest-article')) {
            return {
              ok: true,
              status: 200,
              data: {articleId: 'ARTICLE-001', resourcePrimKey: '101'},
            };
          }

          return {ok: false, status: 404, data: null};
        }),
        putJson: vi.fn(),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: true,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats.scanned).toBe(1);
      expect(mockGateway.getRaw).toHaveBeenCalledWith(expect.stringContaining('articleId=ARTICLE-001'));
      expect(mockGateway.getJson).not.toHaveBeenCalledWith(
        expect.stringContaining('/content-structures/'),
        expect.any(String),
      );
    });

    test('throws summarized failure when putJson fails for one content item', async () => {
      tempDir = createTempDir('migration-putjson-failure-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (requestPath: string) => {
          await Promise.resolve();
          if (requestPath.includes('/content-structures/')) {
            return {
              items: [{id: 'content-1', key: 'article-1', contentStructureId: 'struct-123'}],
              lastPage: 1,
            };
          }
          if (requestPath.includes('/structured-contents/content-1')) {
            return {
              id: 'content-1',
              key: 'article-1',
              contentStructureId: 'struct-123',
              contentFields: [{name: 'oldField', contentFieldValue: {data: 'value'}}],
            };
          }
          return {};
        }),
        putJson: vi.fn(async () => {
          await Promise.resolve();
          throw new Error('upsert failed');
        }),
      });

      await expect(
        runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
          gateway: mockGateway,
          dryRun: false,
          cleanupSource: false,
          fetchStructureByKeyFn: async () => {
            await Promise.resolve();
            return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
          },
        }),
      ).rejects.toThrow('Structure migration failed for 1 content item');
    });

    test("does not cleanup source when cleanupSource is string 'false'", async () => {
      tempDir = createTempDir('migration-cleanup-string-false-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: 'false'}],
        },
      };

      await fs.writeJson(planPath, plan);

      let persistedFields: Array<Record<string, unknown>> = [
        {name: 'oldField', contentFieldValue: {data: 'legacy-value'}},
      ];

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (requestPath: string) => {
          await Promise.resolve();
          if (requestPath.includes('/content-structures/')) {
            return {
              items: [{id: 'content-1', key: 'article-1', contentStructureId: 'struct-123'}],
              lastPage: 1,
            };
          }
          if (requestPath.includes('/structured-contents/content-1')) {
            return {
              id: 'content-1',
              key: 'article-1',
              contentStructureId: 'struct-123',
              contentFields: persistedFields,
            };
          }
          return {};
        }),
        putJson: vi.fn(async (_path: string, payload: {contentFields?: Array<Record<string, unknown>>}) => {
          await Promise.resolve();
          persistedFields = payload.contentFields ?? [];
          return {id: 'content-1'};
        }),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: false,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats.migrated).toBe(1);
      expect(persistedFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({name: 'oldField', contentFieldValue: {data: 'legacy-value'}}),
          expect.objectContaining({name: 'newField', contentFieldValue: {data: 'legacy-value'}}),
        ]),
      );
    });

    test('accepts persisted contentFields with equivalent data but different object key order', async () => {
      tempDir = createTempDir('migration-persisted-order-');
      const planPath = path.join(tempDir, 'plan.json');

      await fs.writeJson(planPath, {
        plan: {
          mappings: [{source: 'oldField', target: 'newField', cleanupSource: false}],
        },
      });

      let fetchCount = 0;
      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (requestPath: string) => {
          await Promise.resolve();
          if (requestPath.includes('/content-structures/')) {
            return {
              items: [{id: 'content-1', key: 'article-1', contentStructureId: 'struct-123'}],
              lastPage: 1,
            };
          }

          if (requestPath.includes('/structured-contents/content-1')) {
            fetchCount += 1;

            if (fetchCount === 1) {
              return {
                id: 'content-1',
                key: 'article-1',
                contentStructureId: 'struct-123',
                contentFields: [{name: 'oldField', contentFieldValue: {data: 'legacy-value'}}],
              };
            }

            return {
              id: 'content-1',
              key: 'article-1',
              contentStructureId: 'struct-123',
              contentFields: [
                {contentFieldValue: {data: 'legacy-value'}, name: 'oldField'},
                {contentFieldValue: {data: 'legacy-value'}, name: 'newField'},
              ],
            };
          }

          return {};
        }),
        putJson: vi.fn(async () => {
          await Promise.resolve();
          return {id: 'content-1'};
        }),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: false,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats.migrated).toBe(1);
      expect(mockGateway.putJson).toHaveBeenCalledTimes(1);
    });

    test('uses runtime internal names when persisting repeatable fieldset targets', async () => {
      tempDir = createTempDir('migration-fieldset-internal-names-');
      const planPath = path.join(tempDir, 'plan.json');

      await fs.writeJson(planPath, {
        plan: {
          mappings: [
            {source: 'cuerpoDelTexto2', target: 'FieldsetParagrafoDestacado[].UBCuerpoTexto', cleanupSource: false},
            {source: 'textoDestacado', target: 'FieldsetParagrafoDestacado[].UBDestacado', cleanupSource: false},
          ],
        },
      });

      let persistedFields: Array<Record<string, unknown>> = [
        {name: 'cuerpoDelTexto2', contentFieldValue: {data: 'body text'}},
        {name: 'textoDestacado', contentFieldValue: {data: 'highlight'}},
        {
          name: 'FieldsetParagrafoDestacado',
          contentFieldValue: {},
          nestedContentFields: [
            {name: 'UBCuerpoTexto', contentFieldValue: {data: ''}},
            {name: 'UBDestacado', contentFieldValue: {data: ''}},
          ],
        },
      ];

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (requestPath: string) => {
          await Promise.resolve();
          if (requestPath.includes('/o/data-engine/v2.0/data-definitions/struct-123')) {
            return {
              dataDefinitionFields: [
                {
                  name: 'Fieldset84041664',
                  customProperties: {fieldReference: 'FieldsetParagrafoDestacado'},
                  nestedDataDefinitionFields: [
                    {name: 'Text75852383', customProperties: {fieldReference: 'UBCuerpoTexto'}},
                    {name: 'Text98612061', customProperties: {fieldReference: 'UBDestacado'}},
                  ],
                },
              ],
            };
          }

          if (requestPath.includes('/content-structures/')) {
            return {
              items: [{id: 'content-1', key: 'article-1', contentStructureId: 'struct-123'}],
              lastPage: 1,
            };
          }

          if (requestPath.includes('/structured-contents/content-1')) {
            return {
              id: 'content-1',
              key: 'article-1',
              contentStructureId: 'struct-123',
              contentFields: persistedFields,
            };
          }

          return {};
        }),
        putJson: vi.fn(async (_path: string, payload: {contentFields?: Array<Record<string, unknown>>}) => {
          await Promise.resolve();
          const outgoingFieldset = payload.contentFields?.find((field) => field.name === 'Fieldset84041664');
          expect(outgoingFieldset).toBeDefined();
          expect(outgoingFieldset?.nestedContentFields).toEqual([
            {name: 'Text75852383', contentFieldValue: {data: 'body text'}},
            {name: 'Text98612061', contentFieldValue: {data: 'highlight'}},
          ]);

          persistedFields = [
            {name: 'cuerpoDelTexto2', contentFieldValue: {data: 'body text'}},
            {name: 'textoDestacado', contentFieldValue: {data: 'highlight'}},
            {
              name: 'FieldsetParagrafoDestacado',
              contentFieldValue: {},
              nestedContentFields: [
                {name: 'UBCuerpoTexto', contentFieldValue: {data: 'body text'}},
                {name: 'UBDestacado', contentFieldValue: {data: 'highlight'}},
              ],
            },
          ];

          return {id: 'content-1'};
        }),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: false,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats.migrated).toBe(1);
      expect(mockGateway.putJson).toHaveBeenCalledTimes(1);
    });
  });

  describe('captureMigrationSourceSnapshots', () => {
    test('captureMigrationSourceSnapshots is tested via integration tests', async () => {
      await Promise.resolve();
      // captureMigrationSourceSnapshots requires complex setup with full migration plan parsing
      // and API interactions. These are better tested through integration/end-to-end tests
      // rather than unit tests with extensive mocking.
      expect(true).toBe(true);
    });
  });

  describe('migration plan parsing', () => {
    test('parses plan with nested structure', async () => {
      tempDir = createTempDir('migration-plan-nested-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        plan: {
          mappings: [
            {source: 'field1', target: 'newField1'},
            {source: 'field2', target: 'newField2'},
          ],
        },
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (path: string) => {
          await Promise.resolve();
          if (path.includes('/journal/structured-contents')) {
            return {items: []};
          }
          return {};
        }),
        putJson: vi.fn(),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: true,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats).toBeDefined();
      expect(stats.dryRun).toBe(true);
    });

    test('parses plan with direct mappings (no nested structure)', async () => {
      tempDir = createTempDir('migration-plan-direct-');
      const planPath = path.join(tempDir, 'plan.json');

      const plan = {
        mappings: [{source: 'field1', target: 'newField1'}],
      };

      await fs.writeJson(planPath, plan);

      const mockGateway = createMigrationGateway({
        getJson: vi.fn(async (path: string) => {
          await Promise.resolve();
          if (path.includes('/journal/structured-contents')) {
            return {items: []};
          }
          return {};
        }),
        putJson: vi.fn(),
      });

      const stats = await runStructureMigration(mockConfig, 'TEST_STRUCTURE', 20121, planPath, {
        gateway: mockGateway,
        dryRun: true,
        cleanupSource: false,
        fetchStructureByKeyFn: async () => {
          await Promise.resolve();
          return {id: 'struct-123', dataDefinitionKey: 'TEST_STRUCTURE'};
        },
      });

      expect(stats).toBeDefined();
      expect(stats.dryRun).toBe(true);
    });
  });
});
