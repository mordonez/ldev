import {beforeEach, describe, expect, test, vi} from 'vitest';

import {CliError} from '../../src/core/errors.js';
import type {LiferayInventoryPageResult} from '../../src/features/liferay/inventory/liferay-inventory-page.js';
import {
  collectDisplayPageCandidatesFromSources,
  resetDisplayPageSourceSupportCache,
  type DisplayPageSource,
} from '../../src/features/liferay/inventory/liferay-inventory-where-used-display-pages.js';
import {buildPageMatch} from '../../src/features/liferay/inventory/liferay-inventory-where-used-pages.js';
import {collectWhereUsedPageCandidates} from '../../src/features/liferay/inventory/liferay-inventory-where-used-page-candidates.js';
import {
  formatLiferayInventoryWhereUsed,
  isSkippableWhereUsedCandidateError,
  matchPageAgainstResource,
  validateWhereUsedResult,
  validateWhereUsedQuery,
  type WhereUsedResult,
} from '../../src/features/liferay/inventory/liferay-inventory-where-used.js';
import {buildPortalAbsoluteUrl} from '../../src/features/liferay/inventory/liferay-inventory-url.js';

const REGULAR_PAGE_BASE: Extract<LiferayInventoryPageResult, {pageType: 'regularPage'}> = {
  pageType: 'regularPage',
  pageSubtype: 'content',
  pageUiType: 'Content Page',
  siteName: 'Guest',
  siteFriendlyUrl: '/guest',
  groupId: 20121,
  url: '/web/guest/home',
  friendlyUrl: '/home',
  pageName: 'Home',
  privateLayout: false,
  layout: {layoutId: 11, plid: 1011, friendlyUrl: '/home', type: 'content', hidden: false},
  layoutDetails: {},
  adminUrls: {
    view: '',
    edit: '',
    configureGeneral: '',
    configureDesign: '',
    configureSeo: '',
    configureOpenGraph: '',
    configureCustomMetaTags: '',
    translate: '',
  },
};

describe('validateWhereUsedQuery', () => {
  test('rejects unknown resource type', () => {
    expect(() => validateWhereUsedQuery({type: 'unknown' as never, keys: ['x']})).toThrow(/--type/);
  });

  test('rejects empty keys', () => {
    expect(() => validateWhereUsedQuery({type: 'fragment', keys: []})).toThrow(/--key/);
    expect(() => validateWhereUsedQuery({type: 'fragment', keys: ['  ']})).toThrow(/--key/);
  });

  test('deduplicates and trims keys', () => {
    expect(validateWhereUsedQuery({type: 'fragment', keys: ['  card  ', 'card', 'hero']})).toEqual({
      type: 'fragment',
      keys: ['card', 'hero'],
    });
  });
});

describe('matchPageAgainstResource - fragments', () => {
  test('matches fragment by fragmentKey on regular page', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [
        {type: 'fragment', fragmentKey: 'banner', elementName: 'main-banner'},
        {type: 'fragment', fragmentKey: 'card-hero'},
        {type: 'widget', widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet'},
      ],
    };

    const matches = matchPageAgainstResource(page, {type: 'fragment', keys: ['card-hero']});
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      resourceType: 'fragment',
      matchedKey: 'card-hero',
      matchKind: 'fragmentEntry',
    });
    expect(matches[0].detail).toContain('index=1');
  });

  test('returns empty when fragment is not present', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [{type: 'fragment', fragmentKey: 'banner'}],
    };
    expect(matchPageAgainstResource(page, {type: 'fragment', keys: ['missing']})).toHaveLength(0);
  });

  test('OR-matches across multiple keys in a single pass', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [
        {type: 'fragment', fragmentKey: 'banner'},
        {type: 'fragment', fragmentKey: 'card-hero'},
      ],
    };
    expect(matchPageAgainstResource(page, {type: 'fragment', keys: ['banner', 'card-hero']})).toHaveLength(2);
  });
});

describe('matchPageAgainstResource - widgets and portlets', () => {
  test('matches widget by widgetName or portletId in fragmentEntryLinks', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [
        {
          type: 'widget',
          widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
          portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_abc',
        },
      ],
    };

    expect(
      matchPageAgainstResource(page, {
        type: 'widget',
        keys: ['com_liferay_journal_content_web_portlet_JournalContentPortlet'],
      }),
    ).toHaveLength(1);

    expect(
      matchPageAgainstResource(page, {
        type: 'portlet',
        keys: ['com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_abc'],
      }),
    ).toHaveLength(1);
  });

  test('matches portlets table on widget pages', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      pageSubtype: 'portlet',
      pageUiType: 'Widget Page',
      portlets: [
        {
          columnId: 'column-1',
          position: 0,
          portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
          portletName: 'Journal Content',
        },
      ],
    };

    const matches = matchPageAgainstResource(page, {
      type: 'widget',
      keys: ['com_liferay_journal_content_web_portlet_JournalContentPortlet'],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchKind).toBe('portlet');
  });
});

describe('matchPageAgainstResource - structures and templates', () => {
  test('matches normalized page evidence without reading page inspection details', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      evidence: [
        {
          resourceType: 'template',
          key: 'UB_TPL_NOVEDAD_NOTA_PRENSA_DETALLE',
          kind: 'journalArticleTemplate',
          detail: 'articleId=ART-1 title=Article',
          source: 'journalArticle',
        },
      ],
    };

    expect(matchPageAgainstResource(page, {type: 'template', keys: ['UB_TPL_NOVEDAD_NOTA_PRENSA_DETALLE']})).toEqual([
      {
        resourceType: 'template',
        matchedKey: 'UB_TPL_NOVEDAD_NOTA_PRENSA_DETALLE',
        matchKind: 'journalArticleTemplate',
        label: 'Journal article template',
        detail: 'articleId=ART-1 title=Article',
        source: 'journalArticle',
      },
    ]);
  });

  test('matches structure via journal article ddmStructureKey', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [
        {
          articleId: 'ART-1',
          title: 'Home',
          ddmStructureKey: 'BASIC',
          ddmTemplateKey: 'DEFAULT',
          contentStructureId: 301,
        },
      ],
      contentStructures: [{contentStructureId: 301, key: 'BASIC', name: 'Basic'}],
    };

    const matches = matchPageAgainstResource(page, {type: 'structure', keys: ['BASIC']});

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      matchKind: 'journalArticleStructure',
      detail: 'articleId=ART-1 title=Home contentStructureId=301 contentStructureName=Basic',
    });
  });

  test('suppresses redundant contentStructure matches when querying by contentStructureId', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [
        {
          articleId: 'ART-1',
          title: 'Home',
          ddmStructureKey: 'BASIC',
          contentStructureId: 301,
        },
      ],
      contentStructures: [{contentStructureId: 301, key: 'BASIC', name: 'Basic'}],
    };

    const matches = matchPageAgainstResource(page, {type: 'structure', keys: ['301']});

    expect(matches).toEqual([
      {
        resourceType: 'structure',
        matchedKey: '301',
        matchKind: 'contentStructure',
        label: 'Content structure',
        detail: 'contentStructureId=301 name=Basic',
        source: 'contentStructure',
      },
    ]);
  });

  test('suppresses redundant contentStructure matches when query includes key and contentStructureId', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [
        {
          articleId: 'ART-1',
          title: 'Home',
          ddmStructureKey: 'BASIC',
          contentStructureId: 301,
        },
      ],
      contentStructures: [{contentStructureId: 301, key: 'BASIC', name: 'Basic'}],
    };

    const matches = matchPageAgainstResource(page, {type: 'structure', keys: ['BASIC', '301']});

    expect(matches).toEqual([
      {
        resourceType: 'structure',
        matchedKey: 'BASIC',
        matchKind: 'journalArticleStructure',
        label: 'Journal article structure',
        detail: 'articleId=ART-1 title=Home contentStructureId=301 contentStructureName=Basic',
        source: 'journalArticle',
      },
    ]);
  });

  test('matches template via ddmTemplateKey and widgetDefaultTemplate', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [
        {
          articleId: 'ART-1',
          title: 'Home',
          ddmStructureKey: 'BASIC',
          ddmTemplateKey: 'CARD',
          widgetDefaultTemplate: 'WIDGET-CARD',
        },
      ],
    };

    expect(matchPageAgainstResource(page, {type: 'template', keys: ['CARD']})).toHaveLength(1);
    expect(matchPageAgainstResource(page, {type: 'template', keys: ['WIDGET-CARD']})).toHaveLength(1);
    expect(matchPageAgainstResource(page, {type: 'template', keys: ['nope']})).toHaveLength(0);
  });

  test('matches template via display page DDM template references', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [
        {
          articleId: 'ART-1',
          title: 'Home',
          ddmStructureKey: 'BASIC',
          displayPageDdmTemplates: ['DETAIL-TEMPLATE'],
        },
      ],
    };

    expect(matchPageAgainstResource(page, {type: 'template', keys: ['DETAIL-TEMPLATE']})).toHaveLength(1);
  });

  test('matches template via fragment mapped template keys', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [
        {
          type: 'fragment',
          fragmentKey: 'ub_frg_title',
          mappedTemplateKeys: ['UB_TPL_NOVEDAD_NOTA_PRENSA_DETALLE'],
        },
      ],
    };

    const matches = matchPageAgainstResource(page, {
      type: 'template',
      keys: ['UB_TPL_NOVEDAD_NOTA_PRENSA_DETALLE'],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchKind).toBe('fragmentMappedTemplate');
  });

  test('matches adt via widget displayStyle configuration', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [
        {
          type: 'widget',
          widgetName: 'com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet',
          portletId: 'com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_abcd',
          configuration: {displayStyle: 'ddmTemplate_40801'},
        },
      ],
    };

    expect(matchPageAgainstResource(page, {type: 'adt', keys: ['ddmTemplate_40801']})).toEqual([
      {
        resourceType: 'adt',
        matchedKey: 'ddmTemplate_40801',
        matchKind: 'widgetAdt',
        label: 'Widget ADT',
        detail:
          'widgetName=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet portletId=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_abcd index=0 displayStyle=ddmTemplate_40801',
        source: 'fragmentEntryLink',
      },
    ]);
  });

  test('ignores widget template candidates in where-used template matches', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [
        {
          articleId: '33112379',
          title: 'Quan els gats esdevenen una amenaça per a la biodiversitat',
          ddmStructureKey: 'UB_STR_OPINION_EXPERTO',
          ddmTemplateKey: 'UB_TPL_OPINION_EXPERTO_ITEM',
          widgetDefaultTemplate: 'UB_TPL_OPINION_EXPERTO_ITEM',
          widgetTemplateCandidates: ['UB_TPL_OPINION_EXPERTO_ITEM'],
        },
      ],
    };

    expect(matchPageAgainstResource(page, {type: 'template', keys: ['UB_TPL_OPINION_EXPERTO_ITEM']})).toEqual([
      {
        resourceType: 'template',
        matchedKey: 'UB_TPL_OPINION_EXPERTO_ITEM',
        matchKind: 'journalArticleTemplate',
        label: 'Journal article template',
        detail: 'articleId=33112379 title=Quan els gats esdevenen una amenaça per a la biodiversitat',
        source: 'journalArticle',
      },
    ]);
  });

  test('matches structure on a display page via article.contentStructureId', () => {
    const page: LiferayInventoryPageResult = {
      pageType: 'displayPage',
      pageSubtype: 'journalArticle',
      contentItemType: 'WebContent',
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest/w/article',
      friendlyUrl: '/article',
      article: {id: 99, key: 'ART-1', title: 'Article', friendlyUrlPath: '/article', contentStructureId: 301},
      journalArticles: [{articleId: 'ART-1', title: 'Article', ddmStructureKey: 'BASIC'}],
    };

    expect(matchPageAgainstResource(page, {type: 'structure', keys: ['BASIC']})).toHaveLength(1);
    expect(matchPageAgainstResource(page, {type: 'structure', keys: ['301']})).toHaveLength(1);
  });
});

describe('matchPageAgainstResource - siteRoot pages', () => {
  test('returns empty for siteRoot pages', () => {
    const page: LiferayInventoryPageResult = {
      pageType: 'siteRoot',
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest',
      pages: [],
    };
    expect(matchPageAgainstResource(page, {type: 'fragment', keys: ['banner']})).toHaveLength(0);
  });
});

describe('buildPageMatch', () => {
  test('omits display page viewUrl when there is no evidence of display-page rendering', () => {
    const page: LiferayInventoryPageResult = {
      pageType: 'displayPage',
      pageSubtype: 'journalArticle',
      contentItemType: 'WebContent',
      siteName: 'UB',
      siteFriendlyUrl: '/ub',
      groupId: 2685349,
      url: '/web/ub/w/xarxes-internacionals',
      friendlyUrl: '/w/xarxes-internacionals',
      article: {
        id: 7109595,
        key: '7109595',
        title: 'Xarxes internacionals',
        friendlyUrlPath: 'xarxes-internacionals',
        contentStructureId: 2810759,
      },
      adminUrls: {
        edit: 'http://localhost:8080/group/ub/edit-article',
        translate: 'http://localhost:8080/group/ub/translate-article',
      },
      journalArticles: [
        {
          articleId: '7109595',
          title: 'Xarxes internacionals',
          ddmStructureKey: 'UB_STR_LISTA_ENLACES',
        },
      ],
      contentStructures: [{contentStructureId: 2810759, name: 'UB_STR_LISTA_ENLACES'}],
    };

    const match = buildPageMatch(
      page,
      {
        fullUrl: '/web/ub/w/xarxes-internacionals',
        friendlyUrl: '/web/ub/w/xarxes-internacionals',
        name: '/web/ub/w/xarxes-internacionals',
        layoutId: -1,
        plid: -1,
        hidden: false,
        privateLayout: false,
      },
      [
        {
          resourceType: 'structure',
          matchedKey: 'UB_STR_LISTA_ENLACES',
          matchKind: 'journalArticleStructure',
          label: 'Journal article structure',
          detail: 'articleId=7109595 title=Xarxes internacionals',
          source: 'journalArticle',
        },
      ],
      'http://localhost:8080',
    );

    expect(match.pageType).toBe('displayPage');
    expect(match).not.toHaveProperty('viewUrl');
    expect(match.fullUrl).toBe('/web/ub/w/xarxes-internacionals');
    expect(match.editUrl).toBe('http://localhost:8080/group/ub/edit-article');
  });
});

describe('formatLiferayInventoryWhereUsed', () => {
  test('reports zero matches with a friendly message', () => {
    const result: WhereUsedResult = {
      inventoryType: 'whereUsed',
      query: {type: 'fragment', keys: ['banner']},
      scope: {sites: ['/guest'], includePrivate: false, concurrency: 4, maxDepth: 12},
      summary: {
        totalSites: 1,
        totalScannedPages: 5,
        totalMatchedPages: 0,
        totalMatches: 0,
        totalFailedPages: 0,
      },
      sites: [
        {
          siteFriendlyUrl: '/guest',
          siteName: 'Guest',
          groupId: 20121,
          scannedPages: 5,
          failedPages: 0,
          matchedPages: [],
        },
      ],
    };

    const text = formatLiferayInventoryWhereUsed(result);
    expect(text).toContain('WHERE USED');
    expect(text).toContain('resourceType=fragment');
    expect(text).toContain('No pages matched');
  });

  test('lists matched pages with match details', () => {
    const result: WhereUsedResult = {
      inventoryType: 'whereUsed',
      query: {type: 'fragment', keys: ['banner']},
      scope: {sites: ['/guest'], includePrivate: false, concurrency: 4, maxDepth: 12},
      summary: {
        totalSites: 1,
        totalScannedPages: 1,
        totalMatchedPages: 1,
        totalMatches: 1,
        totalFailedPages: 0,
      },
      sites: [
        {
          siteFriendlyUrl: '/guest',
          siteName: 'Guest',
          groupId: 20121,
          scannedPages: 1,
          failedPages: 0,
          matchedPages: [
            {
              pageType: 'regularPage',
              pageName: 'Home',
              friendlyUrl: '/home',
              fullUrl: '/web/guest/home',
              viewUrl: 'http://localhost:8080/web/guest/home',
              layoutId: 11,
              plid: 1011,
              hidden: false,
              privateLayout: false,
              editUrl: 'http://localhost:8080/web/guest/home?p_l_mode=edit',
              matches: [
                {
                  resourceType: 'fragment',
                  matchedKey: 'banner',
                  matchKind: 'fragmentEntry',
                  label: 'Fragment on page',
                  detail: 'fragmentKey=banner index=0',
                  source: 'fragmentEntryLink',
                },
              ],
            },
          ],
        },
      ],
    };

    const text = formatLiferayInventoryWhereUsed(result);
    expect(text).toContain('site=/guest');
    expect(text).toContain('Home');
    expect(text).toContain('Home http://localhost:8080/web/guest/home');
    expect(text).toContain('Fragment on page: fragmentKey=banner');
    expect(text).toContain('editUrl=http://localhost:8080/web/guest/home');
  });
});

describe('validateWhereUsedResult', () => {
  test('coerces numeric portal groupId values returned as strings', () => {
    const result = validateWhereUsedResult({
      inventoryType: 'whereUsed',
      query: {type: 'template', keys: ['TPL']},
      scope: {sites: ['/actualitat'], includePrivate: false, concurrency: 4, maxDepth: 12},
      summary: {
        totalSites: 1,
        totalScannedPages: 0,
        totalMatchedPages: 0,
        totalMatches: 0,
        totalFailedPages: 0,
      },
      sites: [
        {
          siteFriendlyUrl: '/actualitat',
          siteName: 'Actualitat',
          groupId: '2710030',
          scannedPages: 0,
          failedPages: 0,
          matchedPages: [],
        },
      ],
    });

    expect(result.sites[0].groupId).toBe(2710030);
  });

  test('accepts adt query and match kind in the result schema', () => {
    const result = validateWhereUsedResult({
      inventoryType: 'whereUsed',
      query: {type: 'adt', keys: ['ddmTemplate_40801']},
      scope: {sites: ['/global'], includePrivate: false, concurrency: 4, maxDepth: 12},
      summary: {
        totalSites: 1,
        totalScannedPages: 1,
        totalMatchedPages: 1,
        totalMatches: 1,
        totalFailedPages: 0,
      },
      sites: [
        {
          siteFriendlyUrl: '/global',
          siteName: 'Global',
          groupId: 20121,
          scannedPages: 1,
          failedPages: 0,
          matchedPages: [
            {
              pageType: 'regularPage',
              pageName: 'Search',
              friendlyUrl: '/search',
              fullUrl: '/web/global/search',
              privateLayout: false,
              matches: [
                {
                  resourceType: 'adt',
                  matchedKey: 'ddmTemplate_40801',
                  matchKind: 'widgetAdt',
                  label: 'Widget ADT',
                  detail: 'widgetName=asset-publisher index=0 displayStyle=ddmTemplate_40801',
                  source: 'fragmentEntryLink',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.query.type).toBe('adt');
    expect(result.sites[0].matchedPages[0].matches[0].matchKind).toBe('widgetAdt');
  });
});

describe('where-used display page sources', () => {
  beforeEach(() => {
    resetDisplayPageSourceSupportCache();
  });

  test('continues with later sources when one source has a skippable portal error', async () => {
    const sources: DisplayPageSource[] = [
      {
        origin: 'headlessStructuredContent',
        collect: () =>
          Promise.reject(new CliError('structured contents failed with status=404', {code: 'LIFERAY_GATEWAY_ERROR'})),
      },
      {
        origin: 'jsonwsJournal',
        collect: () =>
          Promise.resolve([
            {fullUrl: '/web/actualitat/w/la-universitat-del-futur', origin: 'jsonwsJournal'},
            {fullUrl: '/web/actualitat/w/la-universitat-del-futur', origin: 'jsonwsJournal'},
          ]),
      },
    ];

    const candidates = await collectDisplayPageCandidatesFromSources(
      {liferay: {url: 'http://localhost:8080'}} as never,
      {groupId: 2710030, siteFriendlyUrl: '/actualitat', name: 'Actualitat', pagesCommand: ''},
      {concurrency: 4, pageSize: 200, dependencies: {}},
      sources,
    );

    expect(candidates).toEqual([{fullUrl: '/web/actualitat/w/la-universitat-del-futur', origin: 'jsonwsJournal'}]);
  });

  test('stops retrying a display page source after it returns a skippable portal error', async () => {
    const collectHeadless = vi.fn<DisplayPageSource['collect']>(() =>
      Promise.reject(new CliError('structured contents failed with status=404', {code: 'LIFERAY_GATEWAY_ERROR'})),
    );
    const collectJsonws = vi.fn<DisplayPageSource['collect']>(() =>
      Promise.resolve([{fullUrl: '/web/actualitat/w/article', origin: 'jsonwsJournal'}]),
    );

    const sources: DisplayPageSource[] = [
      {origin: 'headlessStructuredContent', collect: collectHeadless},
      {origin: 'jsonwsJournal', collect: collectJsonws},
    ];

    const config = {liferay: {url: 'http://localhost:8080'}} as never;
    const site = {groupId: 2710030, siteFriendlyUrl: '/actualitat', name: 'Actualitat', pagesCommand: ''};
    const options = {concurrency: 4, pageSize: 200, dependencies: {}};

    await collectDisplayPageCandidatesFromSources(config, site, options, sources);
    await collectDisplayPageCandidatesFromSources(config, site, options, sources);

    expect(collectHeadless).toHaveBeenCalledTimes(1);
    expect(collectJsonws).toHaveBeenCalledTimes(2);
  });

  test('does not hide headless permission errors as unsupported sources', async () => {
    const sources: DisplayPageSource[] = [
      {
        origin: 'headlessStructuredContent',
        collect: () =>
          Promise.reject(new CliError('structured contents failed with status=403', {code: 'LIFERAY_GATEWAY_ERROR'})),
      },
    ];

    await expect(
      collectDisplayPageCandidatesFromSources(
        {liferay: {url: 'http://localhost:8080'}} as never,
        {groupId: 2710030, siteFriendlyUrl: '/actualitat', name: 'Actualitat', pagesCommand: ''},
        {concurrency: 4, pageSize: 200, dependencies: {}},
        sources,
      ),
    ).rejects.toThrow(/status=403/);
  });
});

describe('where-used page candidates', () => {
  test('skips display page candidates for resource types that cannot match them', async () => {
    const candidates = await collectWhereUsedPageCandidates(
      {liferay: {url: 'http://localhost:8080'}} as never,
      {groupId: 2710030, siteFriendlyUrl: '/actualitat', name: 'Actualitat', pagesCommand: ''},
      {type: 'fragment', keys: ['ub_frg_title']},
      {layoutScopes: [], concurrency: 4, maxDepth: 12, pageSize: 200, dependencies: {}},
    );

    expect(candidates).toEqual([]);
  });

  test('skips synthetic jsonws display pages when no structured content can be resolved', () => {
    expect(
      isSkippableWhereUsedCandidateError(
        {fullUrl: '/web/ub/w/article', origin: 'jsonwsJournal'},
        new Error(
          'No structured content found with friendlyUrlPath=article. Verify the article URL title and site visibility, or confirm JSONWS/headless permissions for this OAuth client.',
        ),
      ),
    ).toBe(true);

    expect(
      isSkippableWhereUsedCandidateError(
        {fullUrl: '/web/ub/w/article', origin: 'headlessStructuredContent'},
        new Error('No structured content found with friendlyUrlPath=article.'),
      ),
    ).toBe(false);
  });
});

describe('buildPortalAbsoluteUrl', () => {
  test('normalizes relative portal paths against configured base URL', () => {
    expect(buildPortalAbsoluteUrl('http://localhost:8080', '/web/actualitat/w/article')).toBe(
      'http://localhost:8080/web/actualitat/w/article',
    );
  });
});
