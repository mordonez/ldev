import {describe, it, expect} from 'vitest';
import {
  resolvedSiteSchema,
  siteLookupPayloadSchema,
  headlessSiteSchema,
  dataDefinitionSchema,
  contentTemplateSchema,
  jsonwsGroupSearchResultSchema,
  liferayInventorySiteSchema,
  liferayInventoryTemplateSchema,
  liferayInventoryStructureSchema,
  liferayResourceSyncFragmentItemResultSchema,
  liferayResourceSyncFragmentsSingleResultSchema,
  liferayResourceSyncFragmentsResultSchema,
} from '../../src/core/contracts/index.js';

describe('Shared Contracts', () => {
  describe('resolvedSiteSchema', () => {
    it('parses valid resolved site', () => {
      const result = resolvedSiteSchema.parse({
        id: 123,
        friendlyUrlPath: '/my-site',
        name: 'My Site',
      });
      expect(result).toEqual({
        id: 123,
        friendlyUrlPath: '/my-site',
        name: 'My Site',
      });
    });

    it('rejects negative or zero id', () => {
      expect(() => resolvedSiteSchema.parse({id: 0, friendlyUrlPath: '/', name: 'test'})).toThrow();
      expect(() => resolvedSiteSchema.parse({id: -1, friendlyUrlPath: '/', name: 'test'})).toThrow();
    });

    it('requires all fields', () => {
      expect(() => resolvedSiteSchema.parse({id: 123, friendlyUrlPath: '/'})).toThrow();
      expect(() => resolvedSiteSchema.parse({id: 123, name: 'test'})).toThrow();
    });
  });

  describe('siteLookupPayloadSchema', () => {
    it('parses full payload', () => {
      const result = siteLookupPayloadSchema.parse({
        id: 456,
        friendlyUrlPath: '/another-site',
        name: 'Another Site',
      });
      expect(result.id).toBe(456);
      expect(result.friendlyUrlPath).toBe('/another-site');
      expect(result.name).toBe('Another Site');
    });

    it('tolerates partial payload (all optional)', () => {
      const result = siteLookupPayloadSchema.parse({});
      expect(result).toEqual({});
    });

    it('tolerates only id', () => {
      const result = siteLookupPayloadSchema.parse({id: 789});
      expect(result.id).toBe(789);
      expect(result.friendlyUrlPath).toBeUndefined();
    });

    it('accepts localized name as object', () => {
      const result = siteLookupPayloadSchema.parse({
        id: 1,
        name: {en_US: 'English Name', es_ES: 'Spanish Name'},
      });
      expect(result.name).toEqual({en_US: 'English Name', es_ES: 'Spanish Name'});
    });
  });

  describe('headlessSiteSchema', () => {
    it('parses site from headless-admin-site API', () => {
      const result = headlessSiteSchema.parse({
        id: 20140,
        friendlyUrlPath: '/guest',
        nameCurrentValue: 'Guest',
      });
      expect(result.id).toBe(20140);
      expect(result.nameCurrentValue).toBe('Guest');
    });

    it('tolerates nameCurrentValue and name fields', () => {
      const withCurrentValue = headlessSiteSchema.parse({
        id: 20140,
        nameCurrentValue: 'Current Name',
      });
      expect(withCurrentValue.nameCurrentValue).toBe('Current Name');

      const withName = headlessSiteSchema.parse({
        id: 20140,
        name: 'Plain Name',
      });
      expect(withName.name).toBe('Plain Name');
    });

    it('handles localized name object', () => {
      const result = headlessSiteSchema.parse({
        id: 1,
        name: {en_US: 'English'},
      });
      expect(result.name).toEqual({en_US: 'English'});
    });
  });

  describe('dataDefinitionSchema', () => {
    it('parses structure from data-engine API', () => {
      const result = dataDefinitionSchema.parse({
        id: 50100,
        dataDefinitionKey: 'contact-us',
        name: 'Contact Us',
      });
      expect(result.id).toBe(50100);
      expect(result.dataDefinitionKey).toBe('contact-us');
    });

    it('tolerates localized name', () => {
      const result = dataDefinitionSchema.parse({
        id: 50100,
        dataDefinitionKey: 'form',
        name: {en_US: 'Form', es_ES: 'Formulario'},
      });
      expect(result.name).toEqual({en_US: 'Form', es_ES: 'Formulario'});
    });

    it('accepts partial payload', () => {
      const result = dataDefinitionSchema.parse({
        dataDefinitionKey: 'article',
      });
      expect(result.dataDefinitionKey).toBe('article');
      expect(result.id).toBeUndefined();
    });
  });

  describe('contentTemplateSchema', () => {
    it('parses template with numeric id', () => {
      const result = contentTemplateSchema.parse({
        id: 12345,
        name: 'Template 1',
        contentStructureId: 50100,
        externalReferenceCode: 'template-1-erc',
        templateScript: '[...]',
      });
      expect(result.id).toBe(12345);
      expect(typeof result.id).toBe('number');
    });

    it('tolerates string id', () => {
      const result = contentTemplateSchema.parse({
        id: 'tpl-uuid-12345',
        name: 'Template 2',
        contentStructureId: 50100,
        externalReferenceCode: 'erc',
      });
      expect(result.id).toBe('tpl-uuid-12345');
      expect(typeof result.id).toBe('string');
    });

    it('accepts optional templateScript', () => {
      const withScript = contentTemplateSchema.parse({
        id: 1,
        name: 'T1',
        contentStructureId: 50100,
        externalReferenceCode: 'erc',
        templateScript: '[rendered template]',
      });
      expect(withScript.templateScript).toBe('[rendered template]');

      const withoutScript = contentTemplateSchema.parse({
        id: 2,
        name: 'T2',
        contentStructureId: 50100,
        externalReferenceCode: 'erc',
      });
      expect(withoutScript.templateScript).toBeUndefined();
    });
  });

  describe('jsonwsGroupSearchResultSchema', () => {
    it('parses JSONWS group response with friendlyURL (legacy)', () => {
      const result = jsonwsGroupSearchResultSchema.parse({
        groupId: 20136,
        friendlyURL: '/classic-site',
        nameCurrentValue: 'Classic Site',
        site: true,
      });
      expect(result.groupId).toBe(20136);
      expect(result.friendlyURL).toBe('/classic-site');
      expect(result.site).toBe(true);
    });

    it('tolerates friendlyUrl (modern spelling)', () => {
      const result = jsonwsGroupSearchResultSchema.parse({
        groupId: 20137,
        friendlyUrl: '/modern-site',
        nameCurrentValue: 'Modern Site',
        site: true,
      });
      expect(result.friendlyUrl).toBe('/modern-site');
    });

    it('accepts partial JSONWS response', () => {
      const result = jsonwsGroupSearchResultSchema.parse({
        groupId: 20138,
        site: true,
      });
      expect(result.groupId).toBe(20138);
      expect(result.site).toBe(true);
      expect(result.friendlyURL).toBeUndefined();
    });
  });
});

describe('Inventory Contracts', () => {
  describe('liferayInventorySiteSchema', () => {
    it('parses normalized site output', () => {
      const result = liferayInventorySiteSchema.parse({
        groupId: 20140,
        siteFriendlyUrl: '/guest',
        name: 'Guest',
        pagesCommand: 'inventory pages --site /guest',
      });
      expect(result.groupId).toBe(20140);
      expect(result.siteFriendlyUrl).toBe('/guest');
      expect(result.name).toBe('Guest');
    });

    it('requires all fields', () => {
      expect(() =>
        liferayInventorySiteSchema.parse({
          groupId: 20140,
          siteFriendlyUrl: '/guest',
          name: 'Guest',
          // missing pagesCommand
        }),
      ).toThrow();
    });

    it('rejects non-positive groupId', () => {
      expect(() =>
        liferayInventorySiteSchema.parse({
          groupId: 0,
          siteFriendlyUrl: '/test',
          name: 'Test',
          pagesCommand: 'inventory pages --site /test',
        }),
      ).toThrow();
    });
  });

  describe('liferayInventoryTemplateSchema', () => {
    it('parses normalized template output', () => {
      const result = liferayInventoryTemplateSchema.parse({
        id: '12345',
        name: 'Article Template',
        contentStructureId: 50100,
        externalReferenceCode: 'article-template-erc',
        templateScript: '[template rendering code]',
      });
      expect(result.id).toBe('12345');
      expect(result.contentStructureId).toBe(50100);
      expect(result.templateScript).toBe('[template rendering code]');
    });

    it('accepts optional templateScript', () => {
      const result = liferayInventoryTemplateSchema.parse({
        id: '12346',
        name: 'Minimal Template',
        contentStructureId: 50100,
        externalReferenceCode: 'minimal-erc',
      });
      expect(result.templateScript).toBeUndefined();
    });
  });

  describe('liferayInventoryStructureSchema', () => {
    it('parses normalized structure output', () => {
      const result = liferayInventoryStructureSchema.parse({
        id: 50100,
        key: 'article',
        name: 'Basic Article',
      });
      expect(result.id).toBe(50100);
      expect(result.key).toBe('article');
      expect(result.name).toBe('Basic Article');
    });
  });
});

describe('Resource Contracts', () => {
  describe('liferayResourceSyncFragmentItemResultSchema', () => {
    it('parses successful fragment import', () => {
      const result = liferayResourceSyncFragmentItemResultSchema.parse({
        collection: 'content-columns',
        fragment: 'two-column',
        status: 'imported',
        fragmentEntryId: 71234,
      });
      expect(result.status).toBe('imported');
      expect(result.fragmentEntryId).toBe(71234);
      expect(result.error).toBeUndefined();
    });

    it('parses fragment import error', () => {
      const result = liferayResourceSyncFragmentItemResultSchema.parse({
        collection: 'content-columns',
        fragment: 'broken-fragment',
        status: 'error',
        error: 'Fragment HTML is invalid',
      });
      expect(result.status).toBe('error');
      expect(result.error).toBe('Fragment HTML is invalid');
      expect(result.fragmentEntryId).toBeUndefined();
    });

    it('rejects invalid status', () => {
      expect(() =>
        liferayResourceSyncFragmentItemResultSchema.parse({
          collection: 'x',
          fragment: 'y',
          status: 'pending',
        }),
      ).toThrow();
    });
  });

  describe('liferayResourceSyncFragmentsSingleResultSchema', () => {
    it('parses single-site fragment sync result', () => {
      const result = liferayResourceSyncFragmentsSingleResultSchema.parse({
        mode: 'oauth-zip-import',
        site: '/my-site',
        siteId: 20140,
        projectDir: '/home/user/project',
        summary: {
          importedFragments: 5,
          fragmentResults: 5,
          pageTemplateResults: 0,
          errors: 0,
        },
        fragmentResults: [
          {
            collection: 'col1',
            fragment: 'frag1',
            status: 'imported',
            fragmentEntryId: 71234,
          },
        ],
        pageTemplateResults: [],
      });
      expect(result.mode).toBe('oauth-zip-import');
      expect(result.summary.importedFragments).toBe(5);
      expect(result.summary.errors).toBe(0);
    });

    it('parses result with errors', () => {
      const result = liferayResourceSyncFragmentsSingleResultSchema.parse({
        mode: 'oauth-jsonws-import',
        site: '/site',
        siteId: 1,
        projectDir: '/dir',
        summary: {
          importedFragments: 2,
          fragmentResults: 3,
          pageTemplateResults: 0,
          errors: 1,
        },
        fragmentResults: [
          {collection: 'c', fragment: 'f1', status: 'imported', fragmentEntryId: 1},
          {collection: 'c', fragment: 'f2', status: 'imported', fragmentEntryId: 2},
          {collection: 'c', fragment: 'f3', status: 'error', error: 'Invalid HTML'},
        ],
        pageTemplateResults: [],
      });
      expect(result.summary.errors).toBe(1);
      expect(result.fragmentResults).toHaveLength(3);
    });
  });
});

describe('Contract tolerances', () => {
  it('shared schemas accept partial API payloads gracefully', () => {
    const partial = siteLookupPayloadSchema.parse({
      id: 123,
    });
    expect(partial.id).toBe(123);
    expect(Object.keys(partial)).toEqual(['id']);
  });

  it('inventory schemas derive type from Zod inferred type', () => {
    const site = liferayInventorySiteSchema.parse({
      groupId: 1,
      siteFriendlyUrl: '/test',
      name: 'Test',
      pagesCommand: 'inventory pages --site /test',
    });
    // Verify runtime type matches schema
    expect(typeof site.groupId).toBe('number');
    expect(typeof site.siteFriendlyUrl).toBe('string');
  });

  it('discriminated union for fragment sync (single vs all-sites)', () => {
    const singleResult = liferayResourceSyncFragmentsResultSchema.parse({
      mode: 'oauth-zip-import',
      site: '/site',
      siteId: 1,
      projectDir: '/dir',
      summary: {importedFragments: 0, fragmentResults: 0, pageTemplateResults: 0, errors: 0},
      fragmentResults: [],
      pageTemplateResults: [],
    });
    expect('siteResults' in singleResult).toBe(false);

    const allSitesResult = liferayResourceSyncFragmentsResultSchema.parse({
      mode: 'all-sites',
      sites: 2,
      imported: 5,
      errors: 0,
      siteResults: [
        {
          mode: 'oauth-zip-import',
          site: '/site1',
          siteId: 1,
          projectDir: '/dir',
          summary: {importedFragments: 5, fragmentResults: 5, pageTemplateResults: 0, errors: 0},
          fragmentResults: [],
          pageTemplateResults: [],
        },
      ],
    });
    expect('siteResults' in allSitesResult).toBe(true);
    expect(allSitesResult.mode).toBe('all-sites');
  });
});
